import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { POSTGRES_MIGRATIONS, POSTGRES_SCHEMA } from "./postgres-schema";

type Result<T> = { results: T[]; success: boolean; meta: { changes: number } };
type BoundQuery = { text: string; values: unknown[] };
type QueryResult = { rows?: unknown[]; rowCount?: number | null };

let client: NeonQueryFunction<false, true> | null = null;
let schemaReady: Promise<void> | null = null;

function normalizeValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return Number(value);
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeValue(item)]));
  return value;
}

function toResult<T>(result: QueryResult): Result<T> {
  return { results: (result.rows || []).map(normalizeValue) as T[], success: true, meta: { changes: Number(result.rowCount || 0) } };
}

function sqlClient(): NeonQueryFunction<false, true> {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL Neon belum tersedia di deployment.");
  if (!client) client = neon(url, { fullResults: true });
  return client;
}

async function ensureSchema() {
  if (!schemaReady) schemaReady = (async () => {
    const sql = sqlClient();
    const probe = await sql.query("SELECT to_regclass('public.branches') AS exists", []);
    if (!probe.rows?.[0]?.exists) {
      for (const statement of POSTGRES_SCHEMA.split(";").map((x) => x.trim()).filter(Boolean)) await sql.query(statement, []);
    }
    for (const statement of POSTGRES_MIGRATIONS.split(";").map((x) => x.trim()).filter(Boolean)) await sql.query(statement, []);
  })().catch((error) => { schemaReady = null; throw error; });
  await schemaReady;
}

function translate(input: string) {
  let text = input
    .replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, "INSERT INTO")
    .replace(/MAX\(0\s*,/gi, "GREATEST(0,")
    .replace(/DATE\('now'\s*,\s*'\+7 hours'\)/gi, "(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date")
    .replace(/DATE\('now'\)/gi, "CURRENT_DATE")
    .replace(/DATE\(([^)]+)\)/gi, "($1)::date")
    .replace(/STRFTIME\('%Y-%m'\s*,\s*'now'\)/gi, "TO_CHAR(CURRENT_DATE,'YYYY-MM')")
    .replace(/STRFTIME\('%Y-%m'\s*,\s*([^)]+)\)/gi, "TO_CHAR($1,'YYYY-MM')")
    .replace(/LOWER\(HEX\(RANDOMBLOB\(16\)\)\)/gi, "gen_random_uuid()::text")
    .replace(/,\s*[a-zA-Z_][\w]*\.rowid\s+DESC/gi, "")
    .replace(/([a-zA-Z_][\w]*)\.rowid/gi, "$1.id")
    .replace(/\browid\b/gi, "id")
    .replace(/\bAS\s+([a-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*)/g, 'AS "$1"')
    .replace(/\.([a-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*)/g, '."$1"');
  let index = 0;
  text = text.replace(/\?/g, () => `$${++index}`);
  if (/INSERT\s+OR\s+IGNORE/i.test(input)) text += " ON CONFLICT DO NOTHING";
  return text;
}

class Statement {
  private values: unknown[] = [];
  constructor(private text: string) {}
  bind(...values: unknown[]) { this.values = values; return this; }
  query(): BoundQuery { return { text: translate(this.text), values: this.values }; }
  async execute<T>(): Promise<Result<T>> {
    await ensureSchema();
    const query = this.query();
    return toResult<T>(await sqlClient().query(query.text, query.values));
  }
  async all<T = Record<string, unknown>>() { return this.execute<T>(); }
  async first<T = Record<string, unknown>>() { return (await this.execute<T>()).results[0] ?? null; }
  async run() { return this.execute<unknown>(); }
}

const adapter = {
  prepare(text: string) { return new Statement(text); },
  async batch(statements: Statement[]) {
    await ensureSchema();
    const sql = sqlClient();
    const queries = statements.map((statement) => {
      const query = statement.query();
      return sql.query(query.text, query.values);
    });
    const results = await sql.transaction(queries);
    return results.map((result) => toResult(result));
  },
};

export function getDb() { return adapter; }
