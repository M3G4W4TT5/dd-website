import { NextRequest, NextResponse } from "next/server";
import { getAvailability, todayInStudio } from "@/lib/availability";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const date = request.nextUrl.searchParams.get("date") || todayInStudio();
    return NextResponse.json(await getAvailability(date), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const isDateError = error instanceof RangeError;
    return NextResponse.json(
      { error: isDateError ? "Invalid date" : "Availability is temporarily unavailable" },
      { status: isDateError ? 400 : 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
