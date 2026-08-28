import { connectDB } from "@/lib/db";
import { NextResponse } from "next/server";
import Batch from "@/models/Batch";
import Student from "@/models/Student";
import { withCors, optionsResponse } from "@/lib/cors";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return optionsResponse();
}

// PUT /api/batches/:id — admin only
// Supports two modes:
//   1. Status-only update (existing behaviour): { status: "completed"|"active" }
//      → When completed, all active students are automatically marked as "left".
//   2. Full info update: { name, timing, status? }
//      → Updates batch name and/or timing. Students remain unchanged.
export async function PUT(req, context) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  try {
    await connectDB();
    const { id } = await context.params;
    const body = await req.json();

    const allowedStatuses = ["active", "completed"];
    if (body.status && !allowedStatuses.includes(body.status)) {
      return withCors(NextResponse.json({ error: "Invalid status value" }, { status: 400 }));
    }

    // Build the update object — only include fields that were actually sent
    const updateFields = {};
    if (body.name !== undefined) {
      const trimmed = body.name?.trim();
      if (!trimmed) {
        return withCors(NextResponse.json({ error: "Batch name cannot be empty" }, { status: 400 }));
      }
      updateFields.name = trimmed;
    }
    if (body.timing !== undefined) {
      const trimmed = body.timing?.trim();
      if (!trimmed) {
        return withCors(NextResponse.json({ error: "Batch timing cannot be empty" }, { status: 400 }));
      }
      updateFields.timing = trimmed;
    }
    if (body.status !== undefined) {
      updateFields.status = body.status;
    }

    if (Object.keys(updateFields).length === 0) {
      return withCors(NextResponse.json({ error: "No valid fields to update" }, { status: 400 }));
    }

    const updated = await Batch.findByIdAndUpdate(
      id,
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return withCors(NextResponse.json({ error: "Batch not found" }, { status: 404 }));
    }

    // When a batch is completed, mark every active student in it as "left"
    let studentsUpdated = 0;
    if (body.status === "completed") {
      const result = await Student.updateMany(
        { batchId: id, status: "active" },
        { $set: { status: "left", leftDate: new Date() } }
      );
      studentsUpdated = result.modifiedCount ?? 0;
    }

    // Determine the response message
    const isStatusUpdate = body.status !== undefined && !body.name && !body.timing;
    const message = isStatusUpdate
      ? body.status === "completed"
        ? `Batch completed. ${studentsUpdated} student(s) marked as left.`
        : "Batch status updated"
      : "Batch updated successfully";

    return withCors(NextResponse.json({
      success: true,
      message,
      batch: updated,
      studentsUpdated,
    }));
  } catch (err) {
    console.error("Batch PUT error:", err);
    return withCors(NextResponse.json({ error: "Update failed" }, { status: 500 }));
  }
}

// DELETE /api/batches/:id — admin only
export async function DELETE(req, context) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  try {
    await connectDB();
    const { id } = await context.params;

    const deletedBatch = await Batch.findByIdAndDelete(id);

    if (!deletedBatch) {
      return withCors(NextResponse.json({ error: "Batch not found" }, { status: 404 }));
    }

    return withCors(NextResponse.json({ success: true, message: "Batch deleted successfully" }));
  } catch (err) {
    console.error("Batch DELETE error:", err);
    return withCors(NextResponse.json({ error: "Delete failed" }, { status: 500 }));
  }
}
