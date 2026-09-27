// Keep one identity across failed attempts; a successful submission or changed
// form starts a new intent. No address or other form data enters the key.
export function submissionIdentity() {
  let body: string | undefined;
  let id: string | undefined;
  return {
    key(nextBody: string) {
      if (!id || body !== nextBody) {
        body = nextBody;
        id = crypto.randomUUID();
      }
      return id;
    },
    accepted() { id = undefined; body = undefined; },
  };
}

export async function submitWithIdentity(identity: ReturnType<typeof submissionIdentity>, url: string, init: RequestInit) {
  const headers = new Headers(init.headers);
  headers.set("Idempotency-Key", identity.key(String(init.body)));
  const response = await fetch(url, { ...init, headers });
  if (response.ok) {
    const result = await response.clone().json();
    if (result.marketingRequested !== false) identity.accepted();
  }
  return response;
}
