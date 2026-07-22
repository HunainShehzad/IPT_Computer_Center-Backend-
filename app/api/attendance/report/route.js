import { connectDB } from "@/lib/db";
import Attendance from "@/models/Attendance";
import { NextResponse } from "next/server";
import { withCors, optionsResponse } from "@/lib/cors";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return optionsResponse();
}

// GET /api/attendance/report?batchId=xxx&from=YYYY-MM-DD&to=YYYY-MM-DD
// Admin: any batch | Teacher: only assigned batches
export async function GET(request) {
  const { token, error } = await requireAuth(request);
  if (error) return error;

  await connectDB();
  const { searchParams } = new URL(request.url);
  const batchId = searchParams.get("batchId");
  const from    = searchParams.get("from");
  const to      = searchParams.get("to");

  if (!batchId || !from || !to) {
    return withCors(
      NextResponse.json({ error: "batchId, from, and to are required" }, { status: 400 })
    );
  }

  // Validate date format (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(from) || !dateRegex.test(to)) {
    return withCors(
      NextResponse.json({ error: "Dates must be in YYYY-MM-DD format" }, { status: 400 })
    );
  }

  if (from > to) {
    return withCors(
      NextResponse.json({ error: "'from' must be before or equal to 'to'" }, { status: 400 })
    );
  }

  // Teachers can only view their assigned batches
  if (token.role === "teacher") {
    const assigned = token.assignedBatches || [];
    if (!assigned.includes(batchId)) {
      return withCors(NextResponse.json({ error: "Access denied to this batch" }, { status: 403 }));
    }
  }

  const records = await Attendance.find({
    batchId,
    date: { $gte: from, $lte: to },
  }).lean();

  return withCors(NextResponse.json(records));
}
