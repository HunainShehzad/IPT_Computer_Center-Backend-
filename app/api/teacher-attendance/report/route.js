import { connectDB } from "@/lib/db";
import TeacherAttendance from "@/models/TeacherAttendance";
import { NextResponse } from "next/server";
import { withCors, optionsResponse } from "@/lib/cors";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return optionsResponse();
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/teacher-attendance/report
//
// Returns attendance records within a date range, with optional teacher filter.
//
// Admin  → ?from=YYYY-MM-DD&to=YYYY-MM-DD[&teacherId=xxx]
//           Returns all teachers (or one teacher) within the date range.
//
// Teacher→ ?from=YYYY-MM-DD&to=YYYY-MM-DD
//           Returns only their own records — teacherId from JWT, never from query.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request) {
  const { token, error } = await requireAuth(request);
  if (error) return error;

  await connectDB();
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from"); // YYYY-MM-DD
  const to   = searchParams.get("to");   // YYYY-MM-DD

  if (!from || !to) {
    return withCors(
      NextResponse.json({ error: "from and to date params are required" }, { status: 400 })
    );
  }

  const filter = {
    date: { $gte: from, $lte: to },
  };

  if (token.role === "teacher") {
    // Teacher always sees only their own report
    filter.teacherId = token.sub;
  } else {
    // Admin — optionally filter by a specific teacher
    const tid = searchParams.get("teacherId");
    if (tid) filter.teacherId = tid;
  }

  const records = await TeacherAttendance.find(filter)
    .populate("teacherId", "name email department profilePicture")
    .sort({ date: 1 })
    .lean();

  // ── Build summary counts per teacher ────────────────────────────────────
  // Sundays are off-days — exclude them from present/absent/leave/total counts
  // so the attendance rate % reflects only actual working days.
  const summaryMap = {};
  for (const r of records) {
    const id = String(r.teacherId?._id || r.teacherId);
    if (!summaryMap[id]) {
      summaryMap[id] = {
        teacher:  r.teacherId,
        present:  0,
        absent:   0,
        leave:    0,
        total:    0, // working days only (excludes Sundays)
        sundays:  0, // informational — how many Sunday records exist (should be 0)
      };
    }

    // Check if this record's date falls on a Sunday
    // Date string is "YYYY-MM-DD"; new Date parses it as UTC midnight,
    // so getUTCDay() gives the correct day regardless of server timezone.
    const dayOfWeek = new Date(r.date).getUTCDay(); // 0 = Sunday
    if (dayOfWeek === 0) {
      summaryMap[id].sundays++;
      continue; // skip Sunday from all working-day counters
    }

    summaryMap[id].total++;
    if      (r.status === "Present") summaryMap[id].present++;
    else if (r.status === "Absent")  summaryMap[id].absent++;
    else if (r.status === "Leave")   summaryMap[id].leave++;
  }

  // ── Count Sundays in the requested date range ────────────────────────────
  // Used by the frontend to display "X Sundays Off" in summary cards.
  let sundayCount = 0;
  const fromDate = new Date(from);
  const toDate   = new Date(to);
  for (let d = new Date(fromDate); d <= toDate; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() === 0) sundayCount++;
  }

  return withCors(
    NextResponse.json({
      records,
      summary:     Object.values(summaryMap),
      sundayCount, // total Sundays in the requested date range
    })
  );
}
