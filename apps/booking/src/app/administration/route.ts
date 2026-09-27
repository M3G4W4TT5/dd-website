export const dynamic = "force-dynamic";

export function GET() {
  try {
    const base = process.env.PRETIX_SHOP_BASE ||
      (process.env.DD_MODE === "production" ? "" : "http://127.0.0.1:8345");
    const target = new URL("/control/", base);
    if (target.username || target.password ||
        !["http:", "https:"].includes(target.protocol) ||
        (process.env.DD_MODE === "production" && target.protocol !== "https:")) {
      throw new Error("Invalid administration origin");
    }
    return Response.redirect(target, 307);
  } catch {
    return new Response("Administration is temporarily unavailable", { status: 503 });
  }
}
