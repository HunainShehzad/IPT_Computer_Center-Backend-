import { connectDB } from "@/lib/db";
import Batch from "@/models/Batch";
import { NextResponse } from "next/server";
import { withCors, optionsResponse } from "@/lib/cors";
import { requireAuth, requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return optionsResponse();
}

// GET /api/batches — any authenticated user (admin + teacher both need batch lists)
export async function GET(request) {
  const { error } = await requireAuth(request);
  if (error) return error;

  await connectDB();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const filter = status ? { status } : {};
  const batches = await Batch.find(filter).lean();
  return withCors(NextResponse.json(batches));
}

// POST /api/batches — admin only
export async function POST(request) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  await connectDB();
  const body = await request.json();

  // Basic input validation
  if (!body.name?.trim() || !body.timing?.trim()) {
    return withCors(NextResponse.json({ error: "name and timing are required" }, { status: 400 }));
  }

  const newBatch = await Batch.create({
    name: body.name.trim(),
    timing: body.timing.trim(),
    status: body.status || "active",
  });
  return withCors(NextResponse.json(newBatch));
}
