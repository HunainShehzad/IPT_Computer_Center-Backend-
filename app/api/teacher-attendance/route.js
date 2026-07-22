import { connectDB } from "@/lib/db";
import TeacherAttendance from "@/models/TeacherAttendance";
import { NextResponse } from "next/server";
import { withCors, optionsResponse } from "@/lib/cors";
import { requireAdmin, requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return optionsResponse();
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/teacher-attendance
//
// Admin  → ?date=YYYY-MM-DD           all teachers' attendance for that date
//          ?teacherId=xxx&date=...    one teacher on one date
//          (no params)                all records (use for full list)
// Teacher→ always filtered to their own records only
//          ?date=YYYY-MM-DD           their own record for that date
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request) {
  const { token, error } = await requireAuth(request);
  if (error) return error;

  await connectDB();
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");

  let filter = {};

  if (token.role === "teacher") {
    // Teacher can only see their own records
    filter.teacherId = token.sub;
    if (date) filter.date = date;
  } else {
    // Admin — optional filters
    const tid = searchParams.get("teacherId");
    if (tid) filter.teacherId = tid;
    if (date) filter.date = date;
  }

  const records = await TeacherAttendance.find(filter)
    .populate("teacherId", "name email department profilePicture")
    .sort({ date: -1 })
    .lean();

  return withCors(NextResponse.json(records));
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/teacher-attendance
//
// Teacher → marks / updates their OWN attendance for a date
// Admin   → can mark attendance for any teacher
//
// Body: { date, status, note? }             — teacher (teacherId from token)
//       { date, teacherId, status, note? }  — admin (explicit teacherId)
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request) {
  const { token, error } = await requireAuth(request);
  if (error) return error;

  await connectDB();
  const body = await request.json();
  const { date, status, note = "" } = body;

  if (!date || !status) {
    return withCors(
      NextResponse.json({ error: "date and status are required" }, { status: 400 })
    );
  }

  const allowedStatuses = ["Present", "Absent", "Leave"];
  if (!allowedStatuses.includes(status)) {
    return withCors(
      NextResponse.json(
        { error: `Invalid status. Allowed: ${allowedStatuses.join(", ")}` },
        { status: 400 }
      )
    );
  }

  // Determine whose attendance is being marked
  let teacherId;
  if (token.role === "teacher") {
    // Teachers can only mark their own attendance
    teacherId = token.sub;
  } else {
    // Admin must supply teacherId explicitly
    teacherId = body.teacherId;
    if (!teacherId) {
      return withCors(
        NextResponse.json({ error: "teacherId is required for admin" }, { status: 400 })
      );
    }
  }

  const record = await TeacherAttendance.findOneAndUpdate(
    { teacherId, date },
    { status, note },
    { upsert: true, new: true, runValidators: true }
  );

  return withCors(NextResponse.json(record, { status: 200 }));
}
