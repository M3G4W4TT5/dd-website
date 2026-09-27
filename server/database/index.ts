import { Pool, type PoolClient } from "pg";
import {
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
export function database(
  url: string,
  schema?: "primary_marketing" | "booking_marketing",
) {
  if (!url) throw new Error("Database configuration missing");
  return new Pool({
    connectionString: url,
    max: 4,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    allowExitOnIdle: true,
    options: schema ? `-c search_path=${schema},pg_catalog` : undefined,
  });
}
export async function transaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const v = await fn(c);
    await c.query("COMMIT");
    return v;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
export function encrypt(value: unknown, key: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value)),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}
export function decrypt<T>(value: string, key: string): T {
  const b = Buffer.from(value, "base64");
  const c = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(key, "hex"),
    b.subarray(0, 12),
  );
  c.setAuthTag(b.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([c.update(b.subarray(28)), c.final()]).toString(),
  );
}
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function enqueue(
  c: Pool | PoolClient,
  identity: string,
  kind: string,
  payload: unknown,
  key: string,
) {
  await c.query(
    "INSERT INTO deliveries(identity,kind,payload) VALUES($1,$2,$3) ON CONFLICT(identity) DO NOTHING",
    [identity, kind, encrypt(payload, key)],
  );
}
export async function limit(
  pool: Pool,
  key: string,
  max: number,
  seconds: number,
) {
  const result = await pool.query<{ allowed: boolean }>(
    `INSERT INTO abuse_limits(key,hits,expires_at) VALUES($1,1,now()+$3*interval '1 second') ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN abuse_limits.expires_at<now() THEN 1 ELSE abuse_limits.hits+1 END,expires_at=CASE WHEN abuse_limits.expires_at<now() THEN now()+$3*interval '1 second' ELSE abuse_limits.expires_at END RETURNING hits<=$2 AS allowed`,
    [digest(key), max, seconds],
  );
  return result.rows[0].allowed;
}
