import assert from "node:assert/strict";
import test from "node:test";
import { studioEndChoices, studioProgress, studioRangeChanges } from "./mobile-journey";
import { type Availability } from "./booking";
const availability: Availability = {date:"2026-10-05",source:"demo",currency:"DKK",checkedAt:"2026-10-01T00:00:00Z",fullDayDiscount:{discountedHours:2},slots:Array.from({length:14},(_,i)=>({id:String(i),start:`2026-10-05T${String(i+6).padStart(2,"0")}:00:00Z`,end:`2026-10-05T${String(i+7).padStart(2,"0")}:00:00Z`,available:true,priceOre:35000}))};
test("mobile flow always selects an end, including a one-hour booking at closing",()=>{
 assert.deepEqual(studioProgress(), ["date", "start", "end", "review", "details", "payment"]);
 assert.equal(studioEndChoices(availability,"13")[0]?.hours,1);
 assert.equal(studioEndChoices(availability,"13")[0]?.end, availability.slots[13].end);
});
test("mobile end choices are actual boundaries, stop at a busy hour, and retain full-day discounts",()=>{
 const choices=studioEndChoices(availability,"0");
 assert.equal(choices[0].end,availability.slots[0].end);
 assert.equal(choices.at(-1)?.totalOre,12*35000);
 assert.equal(choices.at(-1)?.hours,14);
 const blocked={...availability,slots:availability.slots.map((s,i)=>i===2?{...s,available:false}:s)};
 assert.deepEqual(studioEndChoices(blocked,"0").map(q=>q.hours),[1,2]);
 assert.equal(studioEndChoices(null,"0").length,0);
});

test("range animation changes only the added or removed boundaries in travel order", () => {
 assert.deepEqual(studioRangeChanges(2, 4), [{offset:3,filling:true,delay:0},{offset:4,filling:true,delay:35}]);
 assert.deepEqual(studioRangeChanges(4, 2), [{offset:4,filling:false,delay:0},{offset:3,filling:false,delay:35}]);
 assert.deepEqual(studioRangeChanges(2, 2), []);
 assert.deepEqual(studioRangeChanges(0, 1), [{offset:1,filling:true,delay:0}]);
});
