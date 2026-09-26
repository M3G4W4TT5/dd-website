import { z } from "zod";
import { checkoutPath, type Occurrence } from "./events-model";

export const eventRegistrationSchema = z.object({
  slug: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),
  dateId: z.number().int().positive().nullable(),
  itemId: z.number().int().positive(),
  quantity: z.number().int().min(1),
  unitPrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
  language: z.enum(["da", "en"]),
  name: z.string().trim().min(2).max(100),
  email: z.email().max(254),
  phone: z.string().trim().min(6).max(30).regex(/^[+0-9 ()-]+$/).refine(value => value.replace(/\D/g, "").length >= 6),
  termsAccepted: z.literal(true),
  marketingOptIn: z.boolean(),
});
export type EventRegistration = z.infer<typeof eventRegistrationSchema>;
export type EventTicket = Occurrence["tickets"][number];

export function ticketLimit(ticket: EventTicket, remaining: number | null) {
  return Math.max(0, Math.min(ticket.maxPerOrder ?? Number.MAX_SAFE_INTEGER, ticket.remaining ?? Number.MAX_SAFE_INTEGER, remaining ?? Number.MAX_SAFE_INTEGER));
}

export function registrationTicket(occurrence: Occurrence, input: EventRegistration): EventTicket | null {
  const ticket = occurrence.tickets.find(item => item.id === input.itemId);
  if (!occurrence.signupAvailable || occurrence.status === "room-conflict" || !ticket || ticket.hasVariations ||
    input.quantity < ticket.minPerOrder || input.quantity > ticketLimit(ticket, occurrence.remaining) ||
    Number(input.unitPrice) !== Number(ticket.price)) return null;
  return ticket;
}

// Native cart POST reserves tickets, enforces Pretix's sale/product
// rules and calculates its authoritative prices. Buyer data stays out of URLs.
export function nativeCartHandoff(organizer: string, occurrence: Occurrence, shopBase: string, input: EventRegistration, namespace: string) {
  if (!/^[a-zA-Z0-9]{16}$/.test(namespace)) throw new Error("Invalid cart namespace");
  const configured = new URL(shopBase);
  if (configured.protocol !== "https:") throw new Error("Checkout requires HTTPS");
  const publicUrl = occurrence.shopUrl ? new URL(occurrence.shopUrl) : null;
  const shop = publicUrl?.origin === configured.origin ? publicUrl : new URL(checkoutPath(organizer, occurrence).split("?")[0].replace(/^\//, ""), configured.href.endsWith("/") ? configured : `${configured.href}/`);
  shop.search = "";
  shop.hash = "";
  const cartBase = new URL(`w/${namespace}/`, shop.href.endsWith("/") ? shop : `${shop.href}/`);
  const action = new URL("cart/add", cartBase);
  action.searchParams.set("next", new URL("checkout/start", cartBase).pathname);
  action.searchParams.set("locale", input.language);
  action.searchParams.set("next_error", cartBase.pathname);
  const fields: Record<string, string> = {
    [`item_${input.itemId}`]: String(input.quantity),
    widget_data: JSON.stringify({ email: input.email, phone: input.phone, "invoice-address-name-full-name": input.name }),
  };
  if (occurrence.dateId !== null) fields.subevent = String(occurrence.dateId);
  return { action: action.href, fields };
}
