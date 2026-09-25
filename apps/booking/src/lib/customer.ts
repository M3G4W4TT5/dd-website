import { z } from "zod";
import { MAX_HOURS } from "./booking";

export const customerDetailsSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().max(254),
  phone: z.string().trim().min(6).max(30).regex(/^[+0-9 ()-]+$/),
  customerType: z.enum(["private", "instructor", "business"]),
  attendeeCount: z.number().int().min(1).max(100),
  purpose: z.string().trim().min(2).max(150),
  company: z.string().trim().max(150),
  comment: z.string().trim().max(2_000),
}).superRefine((details, context) => {
  if (details.customerType === "business" && !details.company) {
    context.addIssue({ code: "custom", path: ["company"], message: "Company is required for business bookings" });
  }
});

export const preflightSchema = z.object({
  date: z.iso.date(),
  startId: z.string().min(1).max(100),
  hours: z.number().int().min(1).max(MAX_HOURS),
  details: customerDetailsSchema,
});
