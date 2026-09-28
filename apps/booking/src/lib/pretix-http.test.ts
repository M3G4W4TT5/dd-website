import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { pretixFetch, pretixHeaders, pretixNextPage } from "../../server/pretix-http";

test("hosted Pretix calls keep their private destination and canonical vhost", () => {
  const previous = [process.env.PRETIX_API_BASE, process.env.PRETIX_SHOP_BASE];
  try {
    process.env.PRETIX_API_BASE = "http://pretix:80";
    process.env.PRETIX_SHOP_BASE = "https://checkout.didde-mie.com/";
    const url = new URL("http://pretix/api/v1/organizers/dd-studio/events/studio/discounts/");
    assert.deepEqual(pretixHeaders(url, "example"), {
      Authorization: "Token example",
      Accept: "application/json",
      Host: "checkout.didde-mie.com",
      "X-Forwarded-Proto": "https",
    });
    assert.equal(
      pretixNextPage("https://checkout.didde-mie.com/api/v1/organizers/dd-studio/events/studio/discounts/?page=2", url, new URL(process.env.PRETIX_API_BASE))?.href,
      "http://pretix/api/v1/organizers/dd-studio/events/studio/discounts/?page=2",
    );
    assert.throws(() => pretixHeaders(new URL("https://example.org/"), "example"));
    assert.throws(() => pretixNextPage("https://example.org/api/v1/organizers/dd-studio/events/studio/discounts/?page=2", url, new URL("http://pretix:80")));
    assert.throws(() => pretixNextPage("https://checkout.didde-mie.com/api/v1/organizers/dd-studio/events/studio/orders/", url, new URL("http://pretix:80")));
  } finally {
    if (previous[0] === undefined) delete process.env.PRETIX_API_BASE;
    else process.env.PRETIX_API_BASE = previous[0];
    if (previous[1] === undefined) delete process.env.PRETIX_SHOP_BASE;
    else process.env.PRETIX_SHOP_BASE = previous[1];
  }
});

test("local Pretix requests use the configured API hostname", () => {
  const previous = process.env.PRETIX_API_BASE;
  try {
    process.env.PRETIX_API_BASE = "http://127.0.0.1:8345";
    assert.deepEqual(pretixHeaders(new URL("http://127.0.0.1:8345/api/v1/"), "example"), {
      Authorization: "Token example",
      Accept: "application/json",
    });
  } finally {
    if (previous === undefined) delete process.env.PRETIX_API_BASE;
    else process.env.PRETIX_API_BASE = previous;
  }
});

test("private HTTP transport sends the approved Host and keeps the TCP destination local", async () => {
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ host: request.headers.host, proto: request.headers["x-forwarded-proto"] }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await pretixFetch(new URL(`http://127.0.0.1:${address.port}/api/`), {
      headers: { Host: "checkout.didde-mie.com", "X-Forwarded-Proto": "https" },
      signal: AbortSignal.timeout(1000),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { host: "checkout.didde-mie.com", proto: "https" });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("private transport preserves POST bodies and follows only canonical pagination", async () => {
  const seen: Array<{ method: string; body: string; host: string; path: string }> = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk);
    seen.push({ method: request.method || "", body: Buffer.concat(chunks).toString(),
      host: request.headers.host || "", path: request.url || "" });
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ next: seen.length === 1
      ? "https://checkout.didde-mie.com/api/items/?page=2" : null, results: [seen.length] }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert(address && typeof address !== "string");
    const base = new URL(`http://127.0.0.1:${address.port}`);
    const first = new URL("/api/items/", base);
    const response = await pretixFetch(first, { method: "POST", body: '{"synthetic":true}',
      headers: { Host: "checkout.didde-mie.com", "Content-Type": "application/json" } });
    const page = await response.json();
    const previous = process.env.PRETIX_SHOP_BASE;
    process.env.PRETIX_SHOP_BASE = "https://checkout.didde-mie.com";
    try {
      const next = pretixNextPage(page.next, first, base);
      assert(next);
      const second = await pretixFetch(next, { headers: { Host: "checkout.didde-mie.com" } });
      assert.deepEqual(await second.json(), { next: null, results: [2] });
    } finally {
      if (previous === undefined) delete process.env.PRETIX_SHOP_BASE;
      else process.env.PRETIX_SHOP_BASE = previous;
    }
    assert.deepEqual(seen, [
      { method: "POST", body: '{"synthetic":true}', host: "checkout.didde-mie.com", path: "/api/items/" },
      { method: "GET", body: "", host: "checkout.didde-mie.com", path: "/api/items/?page=2" },
    ]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("private transport aborts a stalled Pretix response", async () => {
  const server = createServer((_request, _response) => {});
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert(address && typeof address !== "string");
    await assert.rejects(pretixFetch(new URL(`http://127.0.0.1:${address.port}/api/`), {
      headers: { Host: "checkout.didde-mie.com" }, signal: AbortSignal.timeout(50),
    }), { name: "AbortError" });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
