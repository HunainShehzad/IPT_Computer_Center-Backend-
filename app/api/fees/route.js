import { connectDB } from "@/lib/db";
import Fee from "@/models/Fee";
import { NextResponse } from "next/server";
import { withCors, optionsResponse } from "@/lib/cors";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return optionsResponse();
}

// GET /api/fees?batchId=xxx — admin only
// Fee management is an admin-only responsibility
export async function GET(request) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  await connectDB();
  const { searchParams } = new URL(request.url);
  const batchId = searchParams.get("batchId");

  if (!batchId) {
    return withCors(NextResponse.json({ error: "batchId is required" }, { status: 400 }));
  }

  const fees = await Fee.find({ batchId }).lean();
  return withCors(NextResponse.json(fees));
}

// POST /api/fees — admin only (upsert a fee record)
//
// Body: { studentId, batchId, month, status }
//
// When status transitions to "Paid" and no paidAt is stored yet, we stamp
// paidAt with the current time.  If a record is set back to "Unpaid" we
// clear paidAt so it won't show up in time-based revenue windows.
export async function POST(request) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  await connectDB();
  const body = await request.json();
  const { studentId, batchId, month, status } = body;

  if (!studentId || !batchId || !month || !status) {
    return withCors(
      NextResponse.json({ error: "studentId, batchId, month, and status are required" }, { status: 400 })
    );
  }

  const allowedStatuses = ["Paid", "Unpaid"];
  if (!allowedStatuses.includes(status)) {
    return withCors(NextResponse.json({ error: "status must be Paid or Unpaid" }, { status: 400 }));
  }

  // Build the update payload
  // - If marking Paid: set paidAt only if the existing record doesn't already have one
  //   (so re-saving an already-Paid record doesn't reset the original payment date).
  // - If marking Unpaid: always clear paidAt.
  let updateDoc;
  if (status === "Paid") {
    // $setOnInsert + conditional $set handled via findOneAndUpdate with two steps
    // Strategy: find first, then decide
    const existing = await Fee.findOne({ studentId, batchId, month }).lean();
    if (existing && existing.paidAt) {
      // Already has a payment date — just ensure status is Paid, keep paidAt intact
      updateDoc = { $set: { status: "Paid" } };
    } else {
      // New payment — stamp the current time
      updateDoc = { $set: { status: "Paid", paidAt: new Date() } };
    }
  } else {
    // Marking Unpaid — clear payment date
    updateDoc = { $set: { status: "Unpaid", paidAt: null } };
  }

  const record = await Fee.findOneAndUpdate(
    { studentId, batchId, month },
    updateDoc,
    { upsert: true, new: true }
  );

  return withCors(NextResponse.json(record));
}
