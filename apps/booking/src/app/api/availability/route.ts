import { HttpError } from "@dd/runtime";
import { catalogRequest } from "../../../../server/catalog-work";
import { AdmissionDenied } from "../../../../../../server/database/admission";
import { NextRequest, NextResponse } from "next/server";
import { getAvailability, todayInStudio } from "@/lib/availability";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await catalogRequest(request);
    const date = request.nextUrl.searchParams.get("date") || todayInStudio();
    return NextResponse.json(await getAvailability(date), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof HttpError) return NextResponse.json({error:error.message},{status:error.status,headers:{"Cache-Control":"no-store"}});
    if (error instanceof AdmissionDenied) return NextResponse.json({error:"Too many requests"},{status:429,headers:{"Cache-Control":"no-store","Retry-After":String(error.retryAfter)}});
    const isDateError = error instanceof RangeError;
    return NextResponse.json(
      { error: isDateError ? "Invalid date" : "Availability is temporarily unavailable" },
      { status: isDateError ? 400 : 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
