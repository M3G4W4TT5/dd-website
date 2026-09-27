import { z } from "zod";
export type Site = "primary" | "booking";
export type Language = "da" | "en";
export type ManagedBooking = {
  reference: string;
  firstHourIso: string;
  endIso: string;
  paidOre: number;
  status: "paid" | "cancelled";
  refund: "none" | "pending" | "done" | "failed";
};
export const primaryContact = z
  .object({
    site: z.literal("personal").optional(),
    name: z.string().trim().min(1).max(100),
    email: z.email().max(254),
    subject: z.enum([
      "dance",
      "choreography",
      "modelling",
      "brand_partnerships",
      "other",
    ]),
    message: z.string().trim().min(1).max(2000),
    website: z.string().max(200).optional(),
  })
  .strict();
export const bookingContact = z
  .object({
    site: z.literal("booking").optional(),
    name: z.string().trim().min(2).max(120),
    email: z.email().max(254),
    topic: z.enum(["booking", "event", "other"]),
    message: z.string().trim().min(10).max(5000),
    privacyAccepted: z.literal(true),
    website: z.string().max(200).optional(),
  })
  .strict();
export const marketingRequest = z
  .object({
    list: z.enum(["personal", "booking"]).optional(),
    action: z.enum(["subscribe", "unsubscribe"]),
    email: z.email().max(254),
    language: z.enum(["da", "en"]),
    website: z.string().max(200).optional(),
  })
  .strict();
export const marketingAction = z
  .object({
    list: z.enum(["personal", "booking"]).optional(),
    purpose: z.enum(["confirm", "unsubscribe"]),
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict();
export const internalSubscription = z
  .object({
    email: z.email().max(254),
    language: z.enum(["da", "en"]),
    source: z.enum(["booking-details", "event-signup"]),
    optIn: z.literal(true),
    idempotencyKey: z.string().min(16).max(128),
  })
  .strict();
export const normalizeEmail = (email: string) => email.trim().toLowerCase();
