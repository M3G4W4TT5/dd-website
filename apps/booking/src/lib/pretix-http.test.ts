import assert from "node:assert/strict";
import test from "node:test";
import { pretixHeaders, pretixNextPage } from "../../server/pretix-http";

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
