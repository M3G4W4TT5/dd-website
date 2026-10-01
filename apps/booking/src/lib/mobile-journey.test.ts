import assert from "node:assert/strict";
import test from "node:test";
import { studioEndChoices, studioProgress } from "./mobile-journey";
import { quoteInterval, type Availability } from "./booking";
const availability: Availability = {date:"2026-10-05",source:"demo",currency:"DKK",checkedAt:"2026-10-01T00:00:00Z",fullDayDiscount:{discountedHours:2},slots:Array.from({length:14},(_,i)=>({id:String(i),start:`2026-10-05T${String(i+6).padStart(2,"0")}:00:00Z`,end:`2026-10-05T${String(i+7).padStart(2,"0")}:00:00Z`,available:true,priceOre:35000}))};
test("No skips end selection and retains the one-hour quote; Yes adds an explicit end step",()=>{
 assert.ok(!studioProgress(false).includes("end"));
 assert.ok(studioProgress(true).includes("end"));
 assert.equal(quoteInterval(availability,"0",1)?.hours,1);
 assert.equal(studioEndChoices(availability,"13").length,0);
});
test("mobile end choices are actual boundaries, stop at a busy hour, and retain full-day discounts",()=>{
 const choices=studioEndChoices(availability,"0");
 assert.equal(choices[0].end,availability.slots[1].end);
 assert.equal(choices.at(-1)?.totalOre,12*35000);
 assert.equal(choices.at(-1)?.hours,14);
 const blocked={...availability,slots:availability.slots.map((s,i)=>i===2?{...s,available:false}:s)};
 assert.deepEqual(studioEndChoices(blocked,"0").map(q=>q.hours),[2]);
 assert.equal(studioEndChoices(null,"0").length,0);
});
