import { randomUUID } from "node:crypto";
export function submissionId(request: Request) {
  const value = request.headers.get("Idempotency-Key");
  // Older/non-browser callers still represent a new submission per request.
  if (value === null) return randomUUID();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
    throw new Error("Invalid submission identity");
  return value.toLowerCase();
}
