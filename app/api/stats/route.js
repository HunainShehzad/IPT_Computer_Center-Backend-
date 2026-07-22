import { connectDB } from "@/lib/db";
import Student from "@/models/Student";
import Batch from "@/models/Batch";
import { NextResponse } from "next/server";
import { withCors, optionsResponse } from "@/lib/cors";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return optionsResponse();
}

// GET /api/stats — admin only
export async function GET(request) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  await connectDB();

  const [totalStudents, activeStudents, totalBatches, activeBatches] = await Promise.all([
    // Counts from the Student collection only — teachers are a separate model and never included here
    Student.countDocuments({}),
    Student.countDocuments({ status: "active" }),
    Batch.countDocuments({}),
    Batch.countDocuments({ status: "active" }),
  ]);

  return withCors(NextResponse.json({
    totalStudents,
    activeStudents,
    totalBatches,
    activeBatches,
  }));
}
