import { timingSafeEqual } from "node:crypto";
import { digest } from "@dd/database";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function boundedJson(request: Request, max = 8192) {
  if (
    !/^application\/json(?:;|$)/i.test(
      request.headers.get("content-type") ?? "",
    )
  )
    throw new HttpError(415, "Expected JSON");
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > max))
    throw new HttpError(413, "Request too large");
  if (!request.body) throw new HttpError(400, "Invalid JSON");
  const reader = request.body.getReader();
  let total = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel();
      throw new HttpError(413, "Request too large");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}
export function equal(a: string, b: string) {
  return timingSafeEqual(
    Buffer.from(digest(a), "hex"),
    Buffer.from(digest(b), "hex"),
  );
}
export function json(body: object, status = 200, origin?: string) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      Vary: "Origin",
      "Referrer-Policy": "no-referrer",
      ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
      ...(status === 429 ? { "Retry-After": "3600" } : {}),
    },
  });
}
