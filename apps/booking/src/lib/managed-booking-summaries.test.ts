import assert from "node:assert/strict";
import test from "node:test";
import { getManagedBookingSummaries } from "../../server/managed-booking-summaries";

test("booking summaries use authorised current detail reads and expose only listing fields", async (t) => {
  const env = {
    PRETIX_API_BASE: "https://api.example.invalid", PRETIX_ORGANIZER_SLUG: "synthetic",
    PRETIX_EVENT_SLUG: "studio", PRETIX_ITEM_ID: "3", PRETIX_MANAGE_API_TOKEN: "synthetic-read-token",
  };
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  t.after(() => { for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  } });
  let email = "guest@example.com";
  const paths: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: URL, init: RequestInit) => {
    assert.equal(init.method, "GET");
    const url = new URL(String(input));
    paths.push(url.pathname);
    const match = url.pathname.match(/orders\/(PAID1|CANCEL1)\/$/);
    if (match) {
      assert.equal(url.searchParams.get("include_canceled_positions"), "true");
      return Response.json({
        code: match[1], event: "studio", email, status: match[1] === "PAID1" ? "p" : "c", total: "700.00",
        positions: [{ id: 2, item: 3, subevent: 22 }, { id: 1, item: 3, subevent: 21 }],
        payments: [], refunds: [],
      });
    }
    const id = Number(url.pathname.match(/subevents\/(21|22)\/$/)?.[1]);
    assert.ok(id === 21 || id === 22);
    return Response.json({ id,
      date_from: `2026-10-13T${id === 21 ? "10" : "11"}:00:00+02:00`,
      date_to: `2026-10-13T${id === 21 ? "11" : "12"}:00:00+02:00`,
    });
  });
  const summaries = await getManagedBookingSummaries(["PAID1", "CANCEL1"], "guest@example.com");
  assert.deepEqual(summaries, ["PAID1", "CANCEL1"].map((reference) => ({
    reference, firstHourIso: "2026-10-13T08:00:00.000Z", endIso: "2026-10-13T10:00:00.000Z",
  })));
  assert.equal(paths.length, 6);
  email = "other@example.com";
  await assert.rejects(getManagedBookingSummaries(["PAID1"], "guest@example.com"), /Order access changed/);
});
