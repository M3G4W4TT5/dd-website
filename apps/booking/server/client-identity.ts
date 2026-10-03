import { equal, HttpError } from "@dd/runtime";
import { clientIdentity } from "../../../server/database/admission";
/** The ingress overwrites both headers. Only the proxy and web service hold this key.
 * A Request alone cannot authenticate a socket peer, so forwarding headers alone fail closed. */
export function bookingClient(request: Request) {
  const secret = process.env.BOOKING_INGRESS_KEY;
  if (!secret || !/^[a-f0-9]{64}$/.test(secret)) throw new Error("Booking ingress identity unavailable");
  if (!equal(request.headers.get("x-dd-booking-ingress-key") ?? "", secret))
    throw new HttpError(403, "Untrusted ingress");
  try { return clientIdentity(request.headers.get("x-dd-client-ip") ?? ""); }
  catch { throw new HttpError(403, "Invalid ingress identity"); }
}
