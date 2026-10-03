import assert from "node:assert/strict";
import test from "node:test";
import { localCatalogDemo } from "../../server/local-demo";
import { catalogRequest } from "../../server/catalog-work";
import { getAvailability, todayInStudio } from "../../server/availability";

test("only authenticated, unconfigured development catalog requests use samples without database credentials", async () => {
  for (const name of ["PRETIX_ORGANIZER_SLUG","PRETIX_EVENT_SLUG","PRETIX_ITEM_ID","PRETIX_API_TOKEN","PRETIX_MANAGE_API_TOKEN","PRETIX_MANAGE_WRITE_API_TOKEN","BOOKING_DATABASE_URL","MANAGE_RECOVERY_HASH_KEY"]) delete process.env[name];
  Object.assign(process.env,{NODE_ENV:"development",DD_MODE:"development",BOOKING_INGRESS_KEY:"a".repeat(64),PRETIX_EVENTS_CHECKOUT_ENABLED:"false",BOOKING_SELF_SERVICE_ENABLED:"false",PAYMENT_RELEASE_ENABLED:"false"});
  assert.equal(localCatalogDemo(),true);
  await assert.rejects(catalogRequest(new Request("http://127.0.0.1/")),/Untrusted ingress/);
  await catalogRequest(new Request("http://127.0.0.1/",{headers:{"x-dd-booking-ingress-key":"a".repeat(64),"x-dd-client-ip":"127.0.0.1"}}));
  const availability = await getAvailability(todayInStudio());
  assert.equal(availability.source,"demo");
  assert.equal(availability.slots.length,14);
  for (const override of [
    {NODE_ENV:"production"},{DD_MODE:"production"},{DD_MODE:undefined},
    ...["PRETIX_ORGANIZER_SLUG","PRETIX_EVENT_SLUG","PRETIX_ITEM_ID","PRETIX_API_TOKEN","PRETIX_MANAGE_API_TOKEN","PRETIX_MANAGE_WRITE_API_TOKEN"].map(key => ({[key]:"configured"})),
    ...["PRETIX_EVENTS_CHECKOUT_ENABLED","BOOKING_SELF_SERVICE_ENABLED","PAYMENT_RELEASE_ENABLED"].map(key => ({[key]:"true"})),
  ]) assert.equal(localCatalogDemo({...process.env,...override}),false);
});
