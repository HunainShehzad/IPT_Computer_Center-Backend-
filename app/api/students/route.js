import { connectDB } from "@/lib/db";
import Student from "@/models/Student";
import { NextResponse } from "next/server";
import { withCors, optionsResponse } from "@/lib/cors";
import { requireAuth, requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return optionsResponse();
}

// GET /api/students?batchId=xxx&activeOnly=1
// Admin: can access any batch
// Teacher: can only access batches in their assignedBatches list
export async function GET(request) {
  const { token, error } = await requireAuth(request);
  if (error) return error;

  await connectDB();
  const { searchParams } = new URL(request.url);
  const batchId = searchParams.get("batchId");
  const activeOnly = searchParams.get("activeOnly");

  if (!batchId) {
    return withCors(NextResponse.json({ error: "batchId is required" }, { status: 400 }));
  }

  // Teachers can only query their own assigned batches
  if (token.role === "teacher") {
    const assigned = token.assignedBatches || [];
    if (!assigned.includes(batchId)) {
      return withCors(NextResponse.json({ error: "Access denied to this batch" }, { status: 403 }));
    }
  }

  const filter = { batchId };
  if (activeOnly === "1") filter.status = "active";

  const students = await Student.find(filter).lean();
  return withCors(NextResponse.json(students));
}

// POST /api/students — admin only
export async function POST(request) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  await connectDB();
  const body = await request.json();

  // Input validation
  if (!body.name?.trim()) return withCors(NextResponse.json({ error: "name is required" }, { status: 400 }));
  if (!body.phone?.trim()) return withCors(NextResponse.json({ error: "phone is required" }, { status: 400 }));
  if (!body.batchId) return withCors(NextResponse.json({ error: "batchId is required" }, { status: 400 }));
  if (!body.admissionDate) return withCors(NextResponse.json({ error: "admissionDate is required" }, { status: 400 }));
  if (typeof body.decidedFee !== "number" || body.decidedFee < 0) {
    return withCors(NextResponse.json({ error: "decidedFee must be a non-negative number" }, { status: 400 }));
  }

  const newStudent = await Student.create({
    name: body.name.trim(),
    phone: body.phone.trim(),
    batchId: body.batchId,
    admissionDate: body.admissionDate,
    decidedFee: body.decidedFee,
    status: "active",
  });
  return withCors(NextResponse.json(newStudent, { status: 201 }));
}
