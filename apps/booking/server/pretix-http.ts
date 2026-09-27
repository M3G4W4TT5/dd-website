import { request } from "node:http";

/** Keep API traffic on the private Docker network while using Pretix's public vhost. */
export function pretixHeaders(
  url: URL,
  token: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  const base = new URL(process.env.PRETIX_API_BASE || "http://127.0.0.1:8345");
  if (url.origin !== base.origin) throw new Error("Unexpected pretix API origin");
  const headers: Record<string, string> = {
    Authorization: `Token ${token}`,
    Accept: "application/json",
    ...extra,
  };
  if (base.protocol === "http:" && base.hostname === "pretix") {
    const shop = new URL(process.env.PRETIX_SHOP_BASE || "");
    if (
      shop.protocol !== "https:" ||
      shop.username || shop.password || shop.pathname !== "/" ||
      shop.search || shop.hash
    ) throw new Error("Invalid hosted Pretix shop URL");
    headers.Host = shop.host;
    headers["X-Forwarded-Proto"] = "https";
  }
  return headers;
}

/** Node's fetch replaces Host with the URL host, so hosted requests use http.request. */
export async function pretixFetch(url: URL, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("Host")) return fetch(url, init);
  if (url.protocol !== "http:") throw new Error("Invalid private Pretix URL");
  if (init.body !== undefined && init.body !== null && typeof init.body !== "string")
    throw new Error("Invalid private Pretix request body");
  return new Promise<Response>((resolve, reject) => {
    const outgoing = request(
      url,
      {
        method: init.method || "GET",
        headers: Object.fromEntries(headers),
        signal: init.signal || undefined,
      },
      (incoming) => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        incoming.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 8 * 1024 * 1024) {
            incoming.destroy(new Error("Pretix response limit exceeded"));
            return;
          }
          chunks.push(chunk);
        });
        incoming.on("error", reject);
        incoming.on("end", () => {
          const status = incoming.statusCode || 502;
          const body = [204, 205, 304].includes(status)
            ? null
            : Buffer.concat(chunks);
          resolve(new Response(body, { status, headers: incoming.headers as HeadersInit }));
        });
      },
    );
    outgoing.on("error", reject);
    outgoing.end(init.body || undefined);
  });
}

/** Never follow a public pagination link with an API credential. */
export function pretixNextPage(
  next: string | null,
  current: URL,
  base: URL,
): URL | null {
  if (!next) return null;
  const url = new URL(next, current);
  const shop = process.env.PRETIX_SHOP_BASE
    ? new URL(process.env.PRETIX_SHOP_BASE)
    : null;
  if (url.origin !== base.origin && url.origin !== shop?.origin)
    throw new Error("Unexpected pretix pagination origin");
  if (url.pathname !== current.pathname || url.username || url.password || url.hash)
    throw new Error("Unexpected pretix pagination path");
  return new URL(url.pathname + url.search, base);
}
