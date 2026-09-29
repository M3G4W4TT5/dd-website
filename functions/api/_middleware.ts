export const onRequest = ({ request, next }: { request: Request; next: () => Promise<Response> }) =>
  ["/api/contact", "/api/marketing", "/api/marketing/action"].includes(new URL(request.url).pathname)
    ? next() : Response.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
