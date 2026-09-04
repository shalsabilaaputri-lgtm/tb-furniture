import { getDb } from "@/db";

// Public, unauthenticated, read-only. Hit by an external uptime pinger every
// few minutes so the Neon database never sits idle long enough to suspend
// (avoids the ~15-20s cold-start delay on the first real request of the day).
export async function GET() {
  await getDb().prepare("SELECT 1").first();
  return Response.json({ ok: true, time: new Date().toISOString() });
}
