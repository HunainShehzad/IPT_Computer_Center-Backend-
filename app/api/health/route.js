import { NextResponse } from "next/server";
import { withCors, optionsResponse } from "@/lib/cors";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return optionsResponse();
}

export function GET() {
  return withCors(NextResponse.json({ status: "ok" }));
}
