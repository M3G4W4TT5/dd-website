import { boundedJson, HttpError, json } from "@dd/runtime";
export async function proxyCommunications(request: Request) {
  const origin = process.env.CONTACT_BOOKING_ORIGIN || "http://127.0.0.1:3000";
  if (request.headers.get("origin") !== origin)
    return json({ error: "Origin not allowed" }, 403);
  if (request.method === "OPTIONS")
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
  try {
    const body = await boundedJson(
      request,
      new URL(request.url).pathname === "/api/contact" ? 8192 : 2048,
    );
    if (!process.env.BOOKING_COMMUNICATIONS_URL)
      return json({ error: "Request unavailable" }, 503);
    const res = await fetch(
      new URL(
        new URL(request.url).pathname,
        process.env.BOOKING_COMMUNICATIONS_URL,
      ),
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
        cache: "no-store",
      },
    );
    return new Response(await res.arrayBuffer(), {
      status: res.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        Vary: "Origin",
        ...(res.headers.get("retry-after")
          ? { "Retry-After": res.headers.get("retry-after")! }
          : {}),
      },
    });
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    return json({ error: "Request unavailable" }, 503);
  }
}
