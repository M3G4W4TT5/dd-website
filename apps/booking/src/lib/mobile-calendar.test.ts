import assert from "node:assert/strict";
import { test } from "node:test";
import { mobileMonthCells } from "./mobile-calendar";

test("month grid aligns weekdays and includes all dates across five/six-row and leap months", () => {
  for (const [month, total, offset] of [["2026-10-01",31,3],["2026-11-01",30,6],["2028-02-01",29,1]] as const) {
    const cells = mobileMonthCells(month);
    assert.equal(cells.length % 7, 0);
    assert.equal(cells.filter(Boolean).length, total);
    assert.equal(cells.indexOf(month), offset);
    assert.equal(new Set(cells.filter(Boolean)).size, total);
    assert.equal(cells.filter(Boolean).at(-1), month.slice(0,8)+total);
  }
});
