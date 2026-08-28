import { connectDB } from "@/lib/db";
import Attendance from "@/models/Attendance";
import { NextResponse } from "next/server";
import { withCors, optionsResponse } from "@/lib/cors";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return optionsResponse();
}

// GET /api/attendance/report?batchId=xxx&from=YYYY-MM-DD&to=YYYY-MM-DD&studentIds=id1,id2,id3
// Admin: any batch | Teacher: only assigned batches
// NEW: Supports studentIds parameter to fetch attendance report for specific students
export async function GET(request) {
  const { token, error } = await requireAuth(request);
  if (error) return error;

  await connectDB();
  const { searchParams } = new URL(request.url);
  const batchId = searchParams.get("batchId");
  const from    = searchParams.get("from");
  const to      = searchParams.get("to");
  const studentIdsParam = searchParams.get("studentIds");

  if (!from || !to) {
    return withCors(
      NextResponse.json({ error: "from and to are required" }, { status: 400 })
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

  let query = { date: { $gte: from, $lte: to } };
  
  if (studentIdsParam) {
    // Fetch attendance for specific students (regardless of batch)
    const studentIds = studentIdsParam.split(',');
    query.studentId = { $in: studentIds };
  } else if (batchId) {
    // Backward compatibility: fetch by batchId
    query.batchId = batchId;
    
    // Teachers can only view their assigned batches
    if (token.role === "teacher") {
      const assigned = token.assignedBatches || [];
      if (!assigned.includes(batchId)) {
        return withCors(NextResponse.json({ error: "Access denied to this batch" }, { status: 403 }));
      }
    }
  } else {
    return withCors(NextResponse.json({ error: "Either batchId or studentIds is required" }, { status: 400 }));
  }

  const records = await Attendance.find(query).lean();
  return withCors(NextResponse.json(records));
}
