import { connectDB } from "@/lib/db";
import TeacherSalary from "@/models/TeacherSalary";
import Teacher from "@/models/Teacher";
import { NextResponse } from "next/server";
import { withCors, optionsResponse } from "@/lib/cors";
import { requireAdmin, requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return optionsResponse();
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/teacher-salary
//
// Admin  → ?month=Jan+2025            returns all teachers' salary for that month
//          (no month param)           returns all salary records
// Teacher→ always returns only their own records (filtered by token.sub)
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request) {
  const { token, error } = await requireAuth(request);
  if (error) return error;

  await connectDB();
  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month"); // e.g. "Jan 2025"

  let filter = {};

  if (token.role === "teacher") {
    // Teachers can only see their own salary
    filter.teacherId = token.sub;
  } else {
    // Admin — optional month filter
    if (month) filter.month = month;
    // Optional single-teacher filter for admin detail view
    const tid = searchParams.get("teacherId");
    if (tid) filter.teacherId = tid;
  }

  const records = await TeacherSalary.find(filter)
    .populate("teacherId", "name email department profilePicture")
    .sort({ month: -1 })
    .lean();

  return withCors(NextResponse.json(records));
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/teacher-salary   — Admin only
//
// Upserts a salary record for a teacher+month.
// Body: { teacherId, month, monthlySalary, status?, note?, paidDate? }
//
// paidDate rules (mirrors the Fee model convention):
//   - Transitioning to "Paid":
//       • If caller supplies an explicit paidDate, use it.
//       • If the existing record already has a paidDate, keep it (don't overwrite).
//       • Otherwise stamp today.
//   - Transitioning to "Unpaid": always clear paidDate to null.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  await connectDB();
  const body = await request.json();
  const { teacherId, month, monthlySalary, status = "Unpaid", note = "", paidDate } = body;

  if (!teacherId || !month || monthlySalary === undefined) {
    return withCors(
      NextResponse.json(
        { error: "teacherId, month, and monthlySalary are required" },
        { status: 400 }
      )
    );
  }

  if (typeof monthlySalary !== "number" || monthlySalary < 0) {
    return withCors(
      NextResponse.json({ error: "monthlySalary must be a non-negative number" }, { status: 400 })
    );
  }

  const allowedStatuses = ["Paid", "Unpaid"];
  if (!allowedStatuses.includes(status)) {
    return withCors(NextResponse.json({ error: "Invalid status value" }, { status: 400 }));
  }

  // Verify teacher exists
  const teacher = await Teacher.findById(teacherId).lean();
  if (!teacher) {
    return withCors(NextResponse.json({ error: "Teacher not found" }, { status: 404 }));
  }

  // Resolve the paidDate to store
  let resolvedPaidDate = null;
  if (status === "Paid") {
    if (paidDate) {
      // Caller supplied an explicit date — validate and use it
      const parsed = new Date(paidDate);
      resolvedPaidDate = isNaN(parsed.getTime()) ? new Date() : parsed;
    } else {
      // Check if the existing record already has a paidDate — preserve it
      const existing = await TeacherSalary.findOne({ teacherId, month }).lean();
      resolvedPaidDate = existing?.paidDate ? new Date(existing.paidDate) : new Date();
    }
  }
  // status === "Unpaid" → resolvedPaidDate stays null (clears any existing date)

  const record = await TeacherSalary.findOneAndUpdate(
    { teacherId, month },
    { monthlySalary, status, note, paidDate: resolvedPaidDate },
    { upsert: true, new: true, runValidators: true }
  );

  return withCors(NextResponse.json(record, { status: 200 }));
}
