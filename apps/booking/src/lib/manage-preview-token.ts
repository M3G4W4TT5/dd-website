import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const payloadSchema = z.object({
  firstHourIso: z.iso.datetime({ offset: true }),
  endIso: z.iso.datetime({ offset: true }),
  expiresAt: z.number().int().positive(),
});

export type PreviewPayload = z.infer<typeof payloadSchema>;

function signature(payload: string, key: string): string {
  return createHmac("sha256", key).update(`manage-preview:${payload}`).digest("base64url");
}

export function signPreviewBooking(payload: PreviewPayload, key: string): string {
  const encoded = Buffer.from(JSON.stringify(payloadSchema.parse(payload))).toString("base64url");
  return `${encoded}.${signature(encoded, key)}`;
}

export function verifyPreviewBooking(token: string, key: string, nowMs: number): PreviewPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2 || parts[0].length > 1024 || parts[1].length !== 43) return null;
  const expected = Buffer.from(signature(parts[0], key));
  const received = Buffer.from(parts[1]);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const payload = payloadSchema.parse(JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")));
    return payload.expiresAt > nowMs ? payload : null;
  } catch {
    return null;
  }
}
