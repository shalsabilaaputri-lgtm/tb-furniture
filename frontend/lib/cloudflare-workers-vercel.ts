// Compatibility module for the first Vercel build. The production database
// adapter replaces this binding when PostgreSQL is connected.
type D1Result<T> = {
  results: T[];
  success?: boolean;
  meta: { changes?: number; [key: string]: unknown };
};

type D1PreparedStatement = {
  bind: (...values: unknown[]) => D1PreparedStatement;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  all: <T = Record<string, unknown>>() => Promise<D1Result<T>>;
  run: () => Promise<D1Result<unknown>>;
};

export type VercelD1Compatibility = {
  prepare: (query: string) => D1PreparedStatement;
  batch: (statements: D1PreparedStatement[]) => Promise<D1Result<unknown>[]>;
};

export const env: { DB?: VercelD1Compatibility } = {};
