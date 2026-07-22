import { connectDB } from "@/lib/db";
import Teacher from "@/models/Teacher";
import { NextResponse } from "next/server";
import { withCors, optionsResponse } from "@/lib/cors";
import { requireTeacher } from "@/lib/auth";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return optionsResponse();
}

// GET /api/teacher/me — teacher only (get own profile)
export async function GET(request) {
  const { token, error } = await requireTeacher(request);
  if (error) return error;

  await connectDB();
  const teacher = await Teacher.findById(token.id).lean();
  if (!teacher) {
    return withCors(NextResponse.json({ error: "Teacher not found" }, { status: 404 }));
  }

  const { passwordHash, plainPassword, ...safe } = teacher;
  return withCors(NextResponse.json(safe));
}
