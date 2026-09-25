import "server-only";

import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { Pool } from "pg";

let pool: Pool | undefined;

export async function authorizedManageEmail(code: string): Promise<string | null> {
  if (!/^[A-Za-z0-9]{5,20}$/.test(code)) return null;
  const token = (await cookies()).get("ttd-manage-session")?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const connectionString = process.env.SUBSCRIPTIONS_DATABASE_URL?.trim();
  if (!connectionString) throw new Error("Management database unavailable");
  pool ??= new Pool({ connectionString, max: 4, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, allowExitOnIdle: true });
  const sessionHash = createHash("sha256").update(token).digest("hex");
  const result = await pool.query<{ email: string }>(
    "SELECT email FROM manage_sessions WHERE session_hash = $1 AND expires_at > now() AND $2 = ANY(order_codes)",
    [sessionHash, code],
  );
  return result.rows[0]?.email ?? null;
}
