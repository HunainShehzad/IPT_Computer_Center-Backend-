import { connectDB } from "@/lib/db";
import Student from "@/models/Student";
import { NextResponse } from "next/server";
import { withCors, optionsResponse } from "@/lib/cors";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return optionsResponse();
}

// PUT /api/students/:id
// Admin: can update any student
// Teacher: can only update students in their assigned batches
export async function PUT(req, context) {
  const { token, error } = await requireAuth(req);
  if (error) return error;

  await connectDB();
  const { id } = await context.params;
  const body = await req.json();

  // Fetch the student first to verify ownership for teachers
  const existing = await Student.findById(id).lean();
  if (!existing) {
    return withCors(NextResponse.json({ error: "Student not found" }, { status: 404 }));
  }

  if (token.role === "teacher") {
    const assigned = token.assignedBatches || [];
    if (!assigned.includes(String(existing.batchId))) {
      return withCors(NextResponse.json({ error: "Access denied to this student" }, { status: 403 }));
    }
  }

  // Strip fields that should never be set directly by clients.
  // batchId is intentionally kept — admins are allowed to move a student
  // to a different batch via this endpoint.
  const { _id, __v, createdAt, ...safeUpdate } = body;

  // Teachers cannot reassign a student to a batch outside their own assignments
  if (safeUpdate.batchId && token.role === "teacher") {
    const assigned = token.assignedBatches || [];
    if (!assigned.includes(String(safeUpdate.batchId))) {
      return withCors(NextResponse.json({ error: "Cannot move student to an unassigned batch" }, { status: 403 }));
    }
  }

  // Auto-manage leftDate based on status transition:
  // - Going to "left"   → stamp leftDate with today (only if not already set,
  //                        so re-saving a left student doesn't reset their leave date)
  // - Going to "active" → clear leftDate
  if (safeUpdate.status === "left" && !existing.leftDate) {
    safeUpdate.leftDate = new Date();
  } else if (safeUpdate.status === "active") {
    safeUpdate.leftDate = null;
  }

  const student = await Student.findByIdAndUpdate(
    id,
    { $set: safeUpdate },
    { new: true, runValidators: true }
  );

  return withCors(NextResponse.json(student));
}
