// Shared by Pages and primary communications; no Node or runtime secrets here.
export const PRIMARY_ORIGIN = "https://didde-mie.com";
export const PRIMARY_IP_HEADER = "X-DD-Visitor-IP";
export const PRIMARY_TIME_HEADER = "X-DD-Proxy-Time";
export const PRIMARY_SIGNATURE_HEADER = "X-DD-Proxy-Signature";

export function validVisitorIp(value: string): boolean {
  if (value.includes(".")) {
    return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value) &&
      value.split(".").every((part) => Number(part) <= 255 && String(Number(part)) === part);
  }
  if (!/^[a-fA-F0-9:]{3,39}$/.test(value)) return false;
  const halves = value.split("::");
  if (halves.length > 2) return false;
  const groups = halves.flatMap((half) => half ? half.split(":") : []);
  return groups.every((group) => /^[a-fA-F0-9]{1,4}$/.test(group)) &&
    (halves.length === 2 ? groups.length < 8 : groups.length === 8);
}

function message(path: string, origin: string, ip: string, time: string) {
  return new TextEncoder().encode(["dd-primary-ip-v1", "POST", path, origin, ip, time].join("\n"));
}
async function signingKey(secret: string) {
  if (!/^[a-f0-9]{64}$/.test(secret)) throw new Error("Invalid primary proxy key");
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function signPrimaryIp(secret: string, path: string, origin: string, ip: string, time: string) {
  const signature = await crypto.subtle.sign("HMAC", await signingKey(secret), message(path, origin, ip, time));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
export async function verifyPrimaryIp(secret: string, request: Request, now = Date.now()) {
  const ip = request.headers.get(PRIMARY_IP_HEADER) ?? "";
  const time = request.headers.get(PRIMARY_TIME_HEADER) ?? "";
  const signature = request.headers.get(PRIMARY_SIGNATURE_HEADER) ?? "";
  if (!validVisitorIp(ip) || !/^\d{13}$/.test(time) || Math.abs(now - Number(time)) > 60000 ||
      !/^[a-f0-9]{64}$/.test(signature)) return null;
  const bytes = Uint8Array.from(signature.match(/../g)!, (pair) => parseInt(pair, 16));
  return await crypto.subtle.verify("HMAC", await signingKey(secret), bytes,
    message(new URL(request.url).pathname, request.headers.get("origin") ?? "", ip, time)) ? ip : null;
}
