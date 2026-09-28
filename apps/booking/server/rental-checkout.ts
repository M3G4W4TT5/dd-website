import { createHmac } from "node:crypto";
import { z } from "zod";
import { getAvailability } from "./availability";
import { pretixFetch, pretixHeaders } from "./pretix-http";
import { MAX_HOURS, quoteInterval, type Quote } from "../src/lib/booking";
import type { z as zType } from "zod";
import { preflightSchema } from "../src/lib/customer";

export const rentalCheckoutSchema = preflightSchema.extend({
  acceptedQuote: z.object({
    slotIds: z.array(z.string().min(1).max(100)).min(1).max(MAX_HOURS),
    start: z.iso.datetime({ offset: true }),
    end: z.iso.datetime({ offset: true }),
    hours: z.number().int().min(1).max(MAX_HOURS),
    totalOre: z.number().int().min(0),
    currency: z.literal("DKK"),
  }),
});
export type RentalCheckoutInput = zType.infer<typeof rentalCheckoutSchema>;
export class RentalConflict extends Error {}

const orderSchema = z.object({
  code: z.string(), event: z.string(), status: z.string(), testmode: z.boolean(),
  email: z.string(), total: z.string(), expires: z.string().nullable(),
  url: z.string(), api_meta: z.record(z.string(), z.unknown()).nullable().optional(),
  positions: z.array(z.object({ item: z.number(), subevent: z.number().nullable(),
    price: z.string(), discount: z.number().nullable().optional() })),
  payments: z.array(z.object({ provider: z.string(), amount: z.string(),
    state: z.string(), payment_url: z.string().nullable().optional() })),
});
type Order = z.infer<typeof orderSchema>;

function ore(value: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error("Invalid Pretix money");
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

function sameQuote(a: Quote, b: RentalCheckoutInput["acceptedQuote"]) {
  return a.currency === b.currency && a.hours === b.hours &&
    a.start === b.start && a.end === b.end && a.totalOre === b.totalOre &&
    a.slotIds.length === b.slotIds.length && a.slotIds.every((id, i) => id === b.slotIds[i]);
}

function matchesPositions(order: Order, quote: Quote, itemId: number, discountedHours: number,
                          discountId: number | null): boolean {
  const payableHours = quote.slotIds.length - discountedHours;
  if (payableHours < 1 || quote.totalOre % payableHours !== 0 ||
      order.positions.length !== quote.slotIds.length) return false;
  const expectedPrice = quote.totalOre / payableHours;
  const discounted = new Set(discountedHours ? quote.slotIds.slice(-discountedHours) : []);
  const positions = new Map(order.positions.map(position => [String(position.subevent), position]));
  return positions.size === quote.slotIds.length && quote.slotIds.every(id => {
    const position = positions.get(id);
    return !!position && position.item === itemId &&
      (discounted.has(id)
        ? position.discount === discountId && ore(position.price) === 0
        : position.discount == null && ore(position.price) === expectedPrice);
  });
}

function config() {
  if (process.env.PREVIEW !== "false" || process.env.PAYMENT_ENVIRONMENT !== "sandbox" ||
      process.env.PAYMENT_RELEASE_ENABLED === "true" ||
      process.env.PRETIX_EVENTS_CHECKOUT_ENABLED !== "true") throw new Error("Sandbox checkout closed");
  const organizer = process.env.PRETIX_ORGANIZER_SLUG?.trim();
  const event = process.env.PRETIX_EVENT_SLUG?.trim();
  const itemId = Number(process.env.PRETIX_ITEM_ID);
  const writeToken = process.env.PRETIX_MANAGE_WRITE_API_TOKEN?.trim();
  const readToken = process.env.PRETIX_MANAGE_API_TOKEN?.trim();
  const shop = new URL(process.env.PRETIX_SHOP_BASE || "");
  const localShop = process.env.NODE_ENV === "development" && shop.protocol === "http:" &&
    ["127.0.0.1", "localhost"].includes(shop.hostname);
  if (!organizer || !event || !Number.isInteger(itemId) || itemId <= 0 || !writeToken || !readToken ||
      (shop.protocol !== "https:" && !localShop)) throw new Error("Rental checkout not configured");
  const base = new URL(process.env.PRETIX_API_BASE || "http://127.0.0.1:8345");
  const path = `/api/v1/organizers/${encodeURIComponent(organizer)}/events/${encodeURIComponent(event)}/orders/`;
  return { organizer, event, itemId, writeToken, readToken, shop, base, path };
}

async function api(url: URL, token: string, method = "GET", body?: unknown): Promise<Response> {
  return pretixFetch(url, { method,
    headers: pretixHeaders(url, token, body === undefined ? {} : { "Content-Type": "application/json" }),
    body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(15_000) });
}

type CheckoutDependencies = { availability: typeof getAvailability; request: typeof api };
const checkoutDependencies: CheckoutDependencies = { availability: getAvailability, request: api };

async function existingOrder(cfg: ReturnType<typeof config>, code: string, request: typeof api): Promise<Order | null> {
  const response = await request(new URL(`${cfg.path}${code}/`, cfg.base), cfg.readToken);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Pretix order lookup failed: ${response.status}`);
  return orderSchema.parse(await response.json());
}

function verifyOrder(order: Order, cfg: ReturnType<typeof config>, code: string, intent: string,
                     quote: RentalCheckoutInput["acceptedQuote"], email: string, discountedHours: number,
                     discountId: number | null) {
  if (order.api_meta?.ttd_checkout_intent !== intent) throw new RentalConflict("Submission changed");
  if (order.code !== code || order.event !== cfg.event || !order.testmode || order.status !== "n" ||
      order.email.toLowerCase() !== email.toLowerCase() || ore(order.total) !== quote.totalOre ||
      !matchesPositions(order, quote, cfg.itemId, discountedHours, discountId) ||
      order.payments.length < 1 || order.payments.some(payment => payment.provider !== "stripe" ||
        ore(payment.amount) !== quote.totalOre || payment.state === "confirmed"))
    throw new RentalConflict("Pretix order differs from accepted quote");
  if (!order.expires || Date.parse(order.expires) <= Date.now()) throw new RentalConflict("Reservation expired");
  const pending = order.payments.find(payment => ["created", "pending"].includes(payment.state));
  const paymentUrl = pending?.payment_url || new URL("pay/change", order.url.endsWith("/") ? order.url : `${order.url}/`).href;
  const url = new URL(paymentUrl);
  if (url.origin !== cfg.shop.origin || !url.pathname.includes(`/order/${code}/`))
    throw new Error("Pretix payment URL is not on the configured shop");
  return paymentUrl;
}

async function expireMismatch(cfg: ReturnType<typeof config>, code: string, request: typeof api) {
  const response = await request(new URL(`${cfg.path}${code}/mark_expired/`, cfg.base), cfg.writeToken, "POST", {});
  if (!response.ok) throw new Error(`Pretix mismatch could not be expired: ${response.status}`);
}

// The pending Pretix order is the atomic reservation. Pretix validates the
// explicit full-day discount, owns payment, and expires abandoned reservations.
export async function startRentalCheckout(input: RentalCheckoutInput, idempotencyKey: string,
                                          dependencies: CheckoutDependencies = checkoutDependencies) {
  const cfg = config();
  if (!/^[0-9a-fA-F-]{36}$/.test(idempotencyKey)) throw new RentalConflict("Invalid submission identity");
  const code = "R" + createHmac("sha256", cfg.writeToken).update(idempotencyKey).digest("hex").slice(0, 15).toUpperCase();
  const intent = createHmac("sha256", cfg.writeToken).update(JSON.stringify(input)).digest("hex");
  let order = await existingOrder(cfg, code, dependencies.request);
  if (order) {
    if (order.api_meta?.ttd_checkout_intent !== intent) throw new RentalConflict("Submission changed");
    const discountHours = Number(order.api_meta?.ttd_discounted_hours);
    const discountId = order.api_meta?.ttd_discount_id == null ? null : Number(order.api_meta.ttd_discount_id);
    return { paymentUrl: verifyOrder(order, cfg, code, intent, input.acceptedQuote, input.details.email, discountHours, discountId),
      created: false };
  }
  const availability = await dependencies.availability(input.date);
  if (availability.source !== "pretix") throw new Error("Authoritative availability required");
  const quote = quoteInterval(availability, input.startId, input.hours);
  if (!quote || !sameQuote(quote, input.acceptedQuote)) throw new RentalConflict("Selection or price changed");
  const discountedHours = quote.hours === MAX_HOURS ? availability.fullDayDiscount?.discountedHours ?? 0 : 0;
  const discountId = discountedHours ? availability.fullDayDiscount?.id : null;
  if (discountedHours && (!discountId || !Number.isInteger(discountId)))
    throw new Error("Pretix discount identity unavailable");
  // Pinned Pretix 2026.7 has an API order-create regression: its automatic
  // discount loop updates only the last position's price. Supply the two
  // discounted positions explicitly from the verified Pretix rule, then
  // simulate and inspect the authoritative order before payment.
  const positions = quote.slotIds.map((subevent, index) => ({
    item: cfg.itemId, subevent: Number(subevent),
    ...(index >= quote.slotIds.length - discountedHours
      ? { price: "0.00", discount: discountId } : {}),
  }));
  const payload = {
    code, testmode: true, status: "n", sales_channel: "web", payment_provider: "stripe",
    email: input.details.email, phone: input.details.phone, locale: input.marketingLanguage || "en",
    send_email: false, valid_if_pending: false,
    expires: new Date(Date.now() + 20 * 60_000).toISOString(),
    invoice_address: { is_business: input.details.customerType === "business",
      company: input.details.company, name_parts: { full_name: input.details.name } },
    positions,
    api_meta: { ttd_checkout_intent: intent, ttd_discounted_hours: discountedHours,
      ttd_discount_id: discountId,
      ttd_customer_type: input.details.customerType, ttd_attendee_count: input.details.attendeeCount,
      ttd_purpose: input.details.purpose, ttd_comment: input.details.comment,
      ttd_terms_accepted: true, ttd_marketing_opt_in: input.marketingOptIn === true },
  };
  const endpoint = new URL(cfg.path, cfg.base);
  const simulation = await dependencies.request(endpoint, cfg.writeToken, "POST", { ...payload, simulate: true });
  if (simulation.status === 400 || simulation.status === 409) throw new RentalConflict("Pretix rejected the selection");
  if (!simulation.ok) throw new Error(`Pretix order simulation failed: ${simulation.status}`);
  const simulated = orderSchema.parse(await simulation.json());
  if (ore(simulated.total) !== quote.totalOre ||
      !matchesPositions(simulated, quote, cfg.itemId, discountedHours, discountId ?? null))
    throw new RentalConflict("Pretix total or discount changed");
  let response: Response | undefined;
  try { response = await dependencies.request(endpoint, cfg.writeToken, "POST", payload); }
  catch { /* A timeout can occur after Pretix committed. Recover by deterministic code. */ }
  if (response?.ok) order = orderSchema.parse(await response.json());
  else order = await existingOrder(cfg, code, dependencies.request);
  if (!order) {
    if (response && [400, 409].includes(response.status)) throw new RentalConflict("Pretix inventory changed");
    throw new Error("Pretix order outcome uncertain; retry with the same submission identity");
  }
  if (order.api_meta?.ttd_checkout_intent !== intent) throw new RentalConflict("Submission changed");
  try {
    return { paymentUrl: verifyOrder(order, cfg, code, intent, quote, input.details.email, discountedHours, discountId ?? null),
      created: response?.ok === true };
  } catch (error) {
    // Only this intent's still-pending reservation may be cleaned up. A fresh
    // read prevents a payment completed during verification from being expired.
    const current = await existingOrder(cfg, code, dependencies.request);
    if (current?.status === "n" && current.api_meta?.ttd_checkout_intent === intent)
      await expireMismatch(cfg, code, dependencies.request);
    throw error;
  }
}
