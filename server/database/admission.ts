import { createHmac, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import type { Pool, PoolClient } from "pg";
import { transaction } from "./index";

export class AdmissionDenied extends Error {
  constructor(public reason: "client" | "contact" | "capacity", public retryAfter = 60) {
    super("Admission unavailable");
  }
}
export function setting(name: string, fallback: number, ceiling = 100000) {
  const text = process.env[name];
  if (text === undefined || text === "") return fallback;
  if (!/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(Number(text)) || Number(text) > ceiling)
    throw new Error("Invalid admission configuration: " + name);
  return Number(text);
}
/** net.isIP validates before expansion; mapped IPv4 has the same quota as IPv4. */
export function clientIdentity(raw: string) {
  const version = isIP(raw);
  if (!version || raw.includes("%")) throw new Error("Invalid client address");
  if (version === 4) return { address: raw, prefix: raw.split(".").slice(0, 3).join(".") + ".0/24" };
  const canonical = new URL("http://[" + raw + "]").hostname.slice(1, -1);
  const [left, right] = canonical.split("::");
  const a = left ? left.split(":") : [], b = right ? right.split(":") : [];
  const groups = canonical.includes("::") ? [...a, ...Array(8 - a.length - b.length).fill("0"), ...b] : a;
  const hex = groups.map((g) => g.padStart(4, "0")).join("");
  if (hex.startsWith("00000000000000000000ffff")) {
    const n = parseInt(hex.slice(24), 16);
    return clientIdentity([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join("."));
  }
  return { address: canonical, prefix: hex.slice(0, 16) + "/64" };
}
export function privateKey(secret: string, lane: string, value: string) {
  if (secret.length < 32) throw new Error("Admission hash key missing");
  return createHmac("sha256", secret).update(lane + "\n" + value).digest("hex");
}
const admissions = new WeakMap<Pool, number>();
export async function admission<T>(pool: Pool, lane: string, fn: (c: PoolClient) => Promise<T>) {
  const pending=admissions.get(pool) ?? 0;
  if(pending>=32) throw new AdmissionDenied("capacity");
  admissions.set(pool,pending+1);
  try { return await transaction(pool, async (c) => {
    await c.query("SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='2s'");
    await c.query("SELECT pg_advisory_xact_lock(hashtext(current_schema()),hashtext($1))", ["admission:" + lane]);
    return fn(c);
  }); } finally { admissions.set(pool,(admissions.get(pool) ?? 1)-1); }
}
/** All reservations and allocation MUST share the caller's admission transaction. */
export async function budget(c: PoolClient, key: string, max: number, seconds: number, reason: AdmissionDenied["reason"] = "client") {
  const result = await c.query<{ hits: number; retry: number }>(
    `INSERT INTO admission_budgets(key,hits,expires_at) VALUES($1,1,clock_timestamp()+$2*interval '1 second')
     ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN admission_budgets.expires_at<=clock_timestamp() THEN 1 ELSE admission_budgets.hits+1 END,
     expires_at=CASE WHEN admission_budgets.expires_at<=clock_timestamp() THEN clock_timestamp()+$2*interval '1 second' ELSE admission_budgets.expires_at END
     RETURNING hits, greatest(1,ceil(extract(epoch from expires_at-clock_timestamp())))::int AS retry`, [key, seconds]);
  if (result.rows[0].hits > max) throw new AdmissionDenied(reason, result.rows[0].retry);
}
export async function emergency(c: PoolClient, key: string, burst: number, refillSeconds: number) {
  const r = await c.query<{ tokens: number }>(
    `INSERT INTO admission_emergency(key,tokens,updated_at) VALUES($1,$2-1,clock_timestamp())
     ON CONFLICT(key) DO UPDATE SET tokens=least($2,admission_emergency.tokens+extract(epoch from clock_timestamp()-admission_emergency.updated_at)/$3)-1,updated_at=clock_timestamp()
     RETURNING tokens`, [key, burst, refillSeconds]);
  if (Number(r.rows[0].tokens) < 0) throw new AdmissionDenied("capacity", refillSeconds);
}
export async function lease(pool: Pool, lane: string, max: number, seconds: number) {
  const id = randomUUID();
  await admission(pool, lane, async (c) => {
    await c.query("DELETE FROM admission_leases WHERE lane=$1 AND expires_at<=clock_timestamp()", [lane]);
    const r = await c.query<{ count: string }>("SELECT count(*) FROM admission_leases WHERE lane=$1", [lane]);
    if (Number(r.rows[0].count) >= max) throw new AdmissionDenied("capacity", seconds);
    await c.query("INSERT INTO admission_leases(id,lane,expires_at) VALUES($1,$2,clock_timestamp()+$3*interval '1 second')", [id, lane, seconds]);
  });
  return async () => { await pool.query("DELETE FROM admission_leases WHERE id=$1", [id]); };
}
