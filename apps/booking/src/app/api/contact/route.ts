import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { z } from "zod";

export const runtime = "nodejs";

const contactSchema = z.discriminatedUnion("site", [
  z.object({
    site: z.literal("personal"),
    name: z.string().trim().min(1).max(100),
    email: z.email().max(254),
    subject: z.enum(["dance", "choreography", "modelling", "other"]),
    message: z.string().trim().min(1).max(2000),
    website: z.string().max(200).optional(),
  }),
  z.object({
    site: z.literal("booking"),
    name: z.string().trim().min(2).max(120),
    email: z.email().max(254),
    topic: z.enum(["booking", "event", "other"]),
    message: z.string().trim().min(10).max(5000),
    website: z.string().max(200).optional(),
  }),
]);

const personalSubjects = {
  dance: "Dance / performance",
  choreography: "Choreography / movement",
  modelling: "Modelling / campaign",
  other: "Other",
};

const bookingTopics = {
  booking: "Booking",
  event: "Event",
  other: "Other",
};

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function allowedOrigins() {
  return {
    personal: originOf(process.env.CONTACT_PERSONAL_ORIGIN || process.env.NEXT_PUBLIC_PERSONAL_URL),
    booking: originOf(process.env.CONTACT_BOOKING_ORIGIN || "http://127.0.0.1:3000"),
  };
}

function response(data: object, status: number, origin?: string) {
  const headers = new Headers({ "Cache-Control": "no-store", Vary: "Origin" });
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  return NextResponse.json(data, { status, headers });
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  const { personal } = allowedOrigins();
  if (!origin || origin !== personal) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store",
      Vary: "Origin",
    },
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const origins = allowedOrigins();
  if (!origin || (origin !== origins.personal && origin !== origins.booking)) {
    return response({ error: "Origin not allowed" }, 403);
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return response({ error: "Expected JSON" }, 415, origin);
  }
  const raw = await request.text();
  if (raw.length > 8_192) return response({ error: "Request too large" }, 413, origin);

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return response({ error: "Invalid JSON" }, 400, origin);
  }
  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) return response({ error: "Invalid contact details" }, 400, origin);
  const input = parsed.data;
  if (origin !== origins[input.site]) return response({ error: "Origin not allowed" }, 403, origin);
  if (input.website) return response({ ok: true }, 200, origin);

  const mailbox = input.site === "personal" ? "contact@didde-mie.com" : "booking@didde-mie.com";
  const password = input.site === "personal"
    ? process.env.CONTACT_SMTP_PASSWORD
    : process.env.BOOKING_SMTP_PASSWORD;
  if (!password) return response({ error: "Contact form is not configured" }, 503, origin);

  const topic = input.site === "personal" ? personalSubjects[input.subject] : bookingTopics[input.topic];
  const site = input.site === "personal" ? "DD personal site" : "TTD Studio booking site";
  try {
    const transport = nodemailer.createTransport({
      host: "smtp.purelymail.com",
      port: 465,
      secure: true,
      auth: { user: mailbox, pass: password },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    await transport.sendMail({
      from: mailbox,
      to: mailbox,
      replyTo: { name: input.name, address: input.email },
      subject: `[${site}] ${topic}`,
      text: `New ${site} inquiry\n\nName: ${input.name}\nEmail: ${input.email}\nTopic: ${topic}\n\nMessage:\n${input.message}`,
    });
    return response({ ok: true }, 200, origin);
  } catch {
    console.error("Contact email delivery failed");
    return response({ error: "Message could not be sent" }, 502, origin);
  }
}
