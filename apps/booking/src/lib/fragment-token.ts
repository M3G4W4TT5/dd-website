/** Effect replay sees an empty hash after replaceState; retain the extracted token. */
export function fragmentToken(previous: string, hash: string) {
  return new URLSearchParams(hash.slice(1)).get("token") || previous;
}
