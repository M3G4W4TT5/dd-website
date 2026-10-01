import { DateTime } from "luxon";

/** Monday-first month grid; empty cells preserve weekday alignment. */
export function mobileMonthCells(month: string): (string | null)[] {
  const first = DateTime.fromISO(month).startOf("month");
  const cells: (string | null)[] = Array(first.weekday - 1).fill(null);
  for (let day = 0; day < first.daysInMonth!; day++) cells.push(first.plus({ days: day }).toISODate()!);
  while (cells.length % 7) cells.push(null);
  return cells;
}
