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
// When a batch is marked "completed", all active students in that batch are
// automatically moved to "left" status.
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

    const updated = await Batch.findByIdAndUpdate(
      id,
      { status: body.status },
      { new: true }
    );

    if (!updated) {
      return withCors(NextResponse.json({ error: "Batch not found" }, { status: 404 }));
    }

    // When a batch is completed, mark every active student in it as "left"
    let studentsUpdated = 0;
    if (body.status === "completed") {
      const result = await Student.updateMany(
        { batchId: id, status: "active" },
        { status: "left" }
      );
      studentsUpdated = result.modifiedCount ?? 0;
    }

    return withCors(NextResponse.json({
      success: true,
      message: body.status === "completed"
        ? `Batch completed. ${studentsUpdated} student(s) marked as left.`
        : "Batch status updated",
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
