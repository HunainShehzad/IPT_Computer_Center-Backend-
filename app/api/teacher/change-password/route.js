import { connectDB } from "@/lib/db";
import Teacher from "@/models/Teacher";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { withCors, optionsResponse } from "@/lib/cors";
import { requireTeacher } from "@/lib/auth";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return optionsResponse();
}

// POST /api/teacher/change-password — teacher only (change own password)
export async function POST(request) {
  const { token, error } = await requireTeacher(request);
  if (error) return error;

  await connectDB();
  const body = await request.json();
  const { currentPassword, newPassword } = body;

  if (!currentPassword || !newPassword) {
    return withCors(
      NextResponse.json({ error: "currentPassword and newPassword are required" }, { status: 400 })
    );
  }

  if (typeof newPassword !== "string" || newPassword.length < 6) {
    return withCors(
      NextResponse.json({ error: "New password must be at least 6 characters" }, { status: 400 })
    );
  }

  if (newPassword.length > 128) {
    return withCors(
      NextResponse.json({ error: "Password is too long" }, { status: 400 })
    );
  }

  const teacher = await Teacher.findById(token.id);
  if (!teacher) {
    return withCors(NextResponse.json({ error: "Teacher not found" }, { status: 404 }));
  }

  const valid = await bcrypt.compare(currentPassword, teacher.passwordHash);
  if (!valid) {
    return withCors(
      NextResponse.json({ error: "Current password is incorrect" }, { status: 400 })
    );
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await Teacher.findByIdAndUpdate(token.id, { $set: { passwordHash } });

  return withCors(NextResponse.json({ success: true }));
}
