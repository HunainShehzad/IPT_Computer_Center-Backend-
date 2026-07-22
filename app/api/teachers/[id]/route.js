import { connectDB } from "@/lib/db";
import Teacher from "@/models/Teacher";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { withCors, optionsResponse } from "@/lib/cors";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return optionsResponse();
}

// PUT /api/teachers/:id — admin only
export async function PUT(req, context) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  await connectDB();
  const { id } = await context.params;
  const body = await req.json();

  // Strip fields that should never be set directly by the client
  const { passwordHash, role, _id, __v, createdAt, newPassword, ...updateData } = body;

  // Only allow an explicit password reset if provided
  if (newPassword) {
    if (newPassword.length < 6) {
      return withCors(
        NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 })
      );
    }
    updateData.passwordHash = await bcrypt.hash(newPassword, 12);
  }

  const teacher = await Teacher.findByIdAndUpdate(
    id,
    { $set: updateData },
    { new: true }
  ).lean();

  if (!teacher) {
    return withCors(NextResponse.json({ error: "Teacher not found" }, { status: 404 }));
  }

  const { passwordHash: _, plainPassword: __, ...safe } = teacher;
  return withCors(NextResponse.json(safe));
}

// DELETE /api/teachers/:id — admin only
export async function DELETE(req, context) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  await connectDB();
  const { id } = await context.params;
  const deleted = await Teacher.findByIdAndDelete(id);

  if (!deleted) {
    return withCors(NextResponse.json({ error: "Teacher not found" }, { status: 404 }));
  }

  return withCors(NextResponse.json({ success: true }));
}
