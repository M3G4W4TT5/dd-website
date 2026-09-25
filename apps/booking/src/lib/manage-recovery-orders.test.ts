import assert from "node:assert/strict";
import test from "node:test";
import { recoveryLinks, type RecoveryOrder } from "./manage-recovery-orders";

const order: RecoveryOrder = {
  code: "ABC12", event: "studio", status: "p", email: "Person@Example.com",
  url: "https://shop.example.com/studio/order/ABC12/private/",
  positions: [{ item: 7 }],
};
const shop = new URL("https://shop.example.com/studio/");

test("paid-order recovery excludes other order types and addresses", () => {
  const links = recoveryLinks([
    order,
    { ...order, code: "OTHER", email: "another@example.com" },
    { ...order, code: "CANCELLED", status: "c", positions: [{ item: 7, canceled: true }] },
    { ...order, code: "EVENT", event: "workshop" },
    { ...order, code: "MIXED", positions: [{ item: 7 }, { item: 8 }] },
    { ...order, code: "POSITION", positions: [{ item: 7, canceled: true }] },
  ], "person@example.com", "studio", 7, shop);
  assert.deepEqual(links, [{ code: "ABC12", url: order.url }]);
});

test("recovery refuses order links outside the configured pretix shop", () => {
  assert.throws(() => recoveryLinks([{ ...order, url: "https://other.example.com/studio/order/ABC12/private/" }], "person@example.com", "studio", 7, shop));
  assert.throws(() => recoveryLinks([{ ...order, url: "https://shop.example.com/not-studio/order/ABC12/private/" }], "person@example.com", "studio", 7, shop));
});
