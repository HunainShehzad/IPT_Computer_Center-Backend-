import { connectDB } from "@/lib/db";
import Attendance from "@/models/Attendance";
import { NextResponse } from "next/server";
import { withCors, optionsResponse } from "@/lib/cors";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return optionsResponse();
}

// GET /api/attendance?batchId=xxx&date=YYYY-MM-DD&studentIds=id1,id2,id3
// Admin: any batch | Teacher: only assigned batches
// NEW: Supports studentIds parameter to fetch attendance for specific students
// If studentIds provided, fetches attendance for those students (ignores batchId for query)
export async function GET(request) {
  const { token, error } = await requireAuth(request);
  if (error) return error;

  await connectDB();
  const { searchParams } = new URL(request.url);
  const batchId = searchParams.get("batchId");
  const date    = searchParams.get("date");
  const studentIdsParam = searchParams.get("studentIds");

  if (!date) {
    return withCors(NextResponse.json({ error: "date is required" }, { status: 400 }));
  }

  // Teachers can only read attendance for their assigned batches
  if (token.role === "teacher" && batchId) {
    const assigned = token.assignedBatches || [];
    if (!assigned.includes(batchId)) {
      return withCors(NextResponse.json({ error: "Access denied to this batch" }, { status: 403 }));
    }
  }

  let query = { date };
  
  if (studentIdsParam) {
    // Fetch attendance for specific students (regardless of batch)
    const studentIds = studentIdsParam.split(',');
    query.studentId = { $in: studentIds };
  } else if (batchId) {
    // Backward compatibility: fetch by batchId
    query.batchId = batchId;
  } else {
    return withCors(NextResponse.json({ error: "Either batchId or studentIds is required" }, { status: 400 }));
  }

  const records = await Attendance.find(query).lean();
  return withCors(NextResponse.json(records));
}

// POST /api/attendance
// Admin: any batch | Teacher: only assigned batches
export async function POST(request) {
  const { token, error } = await requireAuth(request);
  if (error) return error;

  await connectDB();
  const body = await request.json();
  const { date, batchId, attendance } = body;

  if (!date || !batchId || !attendance || typeof attendance !== "object") {
    return withCors(
      NextResponse.json({ error: "date, batchId, and attendance object are required" }, { status: 400 })
    );
  }

  // Teachers can only submit attendance for their assigned batches
  if (token.role === "teacher") {
    const assigned = token.assignedBatches || [];
    if (!assigned.includes(batchId)) {
      return withCors(NextResponse.json({ error: "Access denied to this batch" }, { status: 403 }));
    }
  }

  // Validate status values
  const allowedStatuses = new Set(["Present", "Absent"]);
  for (const [, status] of Object.entries(attendance)) {
    if (!allowedStatuses.has(status)) {
      return withCors(
        NextResponse.json({ error: `Invalid attendance status: ${status}` }, { status: 400 })
      );
    }
  }

  await Promise.all(
    Object.entries(attendance).map(([studentId, status]) =>
      Attendance.findOneAndUpdate(
        { date, studentId, batchId },
        { status },
        { upsert: true, new: true }
      )
    )
  );

  return withCors(NextResponse.json({ success: true }));
}
