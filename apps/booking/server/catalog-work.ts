import { createHash } from "node:crypto";
import { admission, budget, emergency, lease, privateKey, setting, AdmissionDenied } from "../../../server/database/admission";
import { bookingDb } from "./notifications";
import { boundedPretix, inPretixScope } from "./pretix-deadline";
import { bookingClient } from "./client-identity";
import { localCatalogDemo } from "./local-demo";

const cache = new Map<string, { until: number; value: unknown }>();
let waiting = 0, databaseAdmissions = 0;
async function guardedAdmission<T>(fn: () => Promise<T>) {
  // Fail without queueing before pool.connect; durable leases remain the shared authority.
  if (databaseAdmissions >= 8) throw new AdmissionDenied("capacity");
  databaseAdmissions++;
  try { return await fn(); } finally { databaseAdmissions--; }
}
const pending = new Map<string, Promise<unknown>>();
export function invalidateCatalog() { cache.clear(); }
function configKey() {
  return createHash("sha256").update(["PRETIX_API_BASE", "PRETIX_ORGANIZER_SLUG", "PRETIX_EVENT_SLUG", "PRETIX_ITEM_ID", "PRETIX_API_TOKEN", "PRETIX_MANAGE_API_TOKEN", "PRETIX_SHOP_BASE", "PREVIEW", "PAYMENT_ENVIRONMENT", "PAYMENT_RELEASE_ENABLED", "PRETIX_EVENTS_CHECKOUT_ENABLED", "PRETIX_DEV_DRAFT_EVENTS", "NODE_ENV", "BOOKING_DATABASE_URL"].map(k=>process.env[k]||"").join("\n")).digest("hex");
}
/** Cache is an optimization. PostgreSQL leases and emergency admission are the security boundary.
 * No application waiting queue: saturated computations fail promptly. */
export async function catalogWork<T>(key: string, fn: () => Promise<T>, fresh = false): Promise<T> {
  if (inPretixScope()) return fn();
  const identity = configKey() + ":" + key;
  if (!fresh) {
    const hit = cache.get(identity);
    if (hit && hit.until > Date.now()) return structuredClone(hit.value) as T;
    const running = pending.get(identity);
    if (running) {
      if (waiting >= 32) throw new AdmissionDenied("capacity");
      waiting++;
      let release: (() => Promise<void>) | undefined;
      try {
        release = await guardedAdmission(()=>lease(bookingDb(), "catalog-waiting", 32, 60));
        return structuredClone(await running) as T;
      } finally { waiting--; if (release) await release(); }
    }
  }
  if (pending.size >= 64) throw new AdmissionDenied("capacity");
  const run = async () => {
    const release = await guardedAdmission(()=>lease(bookingDb(), fresh ? "catalog-checkout" : "catalog-public", setting(fresh ? "CATALOG_CHECKOUT_CONCURRENCY" : "CATALOG_PUBLIC_CONCURRENCY", fresh ? 1 : 2, 8), 60));
    try {
      await guardedAdmission(()=>admission(bookingDb(), "catalog-emergency", c=>emergency(c, fresh ? "catalog-checkout" : "catalog-public", setting("CATALOG_EMERGENCY_BURST", 120), 1)));
      const value = await boundedPretix(fn, setting("CATALOG_DEADLINE_MS", 25000, 30000), setting("CATALOG_REQUEST_MAX", 100, 500));
      if (!fresh) {
        if (cache.size >= 64) cache.delete(cache.keys().next().value!);
        cache.set(identity, { until: Date.now() + setting("CATALOG_CACHE_MS", 5000, 5000), value: structuredClone(value) });
      }
      return value;
    } finally { await release(); }
  };
  if (fresh) return run();
  // Publish promise synchronously before another caller can enter.
  const promise = run(); pending.set(identity, promise);
  try { return structuredClone(await promise); }
  finally { pending.delete(identity); }
}
export async function catalogRequest(request: Request) {
  const client = bookingClient(request), secret = process.env.MANAGE_RECOVERY_HASH_KEY ?? "";
  if (localCatalogDemo()) return;
  await guardedAdmission(()=>admission(bookingDb(), "catalog-client", async c => {
    await budget(c, privateKey(secret, "catalog-client", client.address), setting("CATALOG_CLIENT_MINUTE", 60), 60);
    await budget(c, privateKey(secret, "catalog-prefix", client.prefix), setting("CATALOG_PREFIX_MINUTE", 600), 60);
  }));
}
export async function mapBounded<T, R>(values: T[], fn: (value: T) => Promise<R>) {
  const out: R[] = new Array(values.length);
  let index = 0;
  await Promise.all(Array.from({length: Math.min(4, values.length)}, async () => {
    for (;;) { const i = index++; if (i >= values.length) return; out[i] = await fn(values[i]); }
  }));
  return out;
}
export function paginationGuard() {
  const seen = new Set<string>();
  return (url: URL) => {
    if (seen.has(url.href) || seen.size >= setting("CATALOG_PAGE_MAX", 20, 100)) throw new Error("Pretix pagination ceiling or cycle");
    seen.add(url.href);
  };
}
