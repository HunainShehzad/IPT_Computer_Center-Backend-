import { connectDB } from "@/lib/db";
import Student from "@/models/Student";
import { NextResponse } from "next/server";
import { withCors, optionsResponse } from "@/lib/cors";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return optionsResponse();
}

// POST /api/students/:id/photo — admin only
// Accepts a multipart/form-data upload with field name "photo".
// Stores the image as a base64 data URI on the student document
// (same pattern as /api/teachers/:id/picture).
export async function POST(req, context) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  try {
    await connectDB();
    const { id } = await context.params;

    const formData = await req.formData();
    const file = formData.get("photo");

    if (!file) {
      return withCors(NextResponse.json({ error: "No file provided." }, { status: 400 }));
    }

    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return withCors(
        NextResponse.json({ error: "Only JPEG, PNG, or WebP images are allowed." }, { status: 400 })
      );
    }

    if (file.size > 2 * 1024 * 1024) {
      return withCors(
        NextResponse.json({ error: "Image must be under 2MB." }, { status: 400 })
      );
    }

    const bytes  = await file.arrayBuffer();
    const base64 = `data:${file.type};base64,${Buffer.from(bytes).toString("base64")}`;

    const student = await Student.findByIdAndUpdate(
      id,
      { $set: { photo: base64 } },
      { new: true }
    ).lean();

    if (!student) {
      return withCors(NextResponse.json({ error: "Student not found." }, { status: 404 }));
    }

    return withCors(NextResponse.json({ success: true, photo: student.photo }));
  } catch (err) {
    console.error("Student photo upload error:", err);
    return withCors(NextResponse.json({ error: "Upload failed." }, { status: 500 }));
  }
}

// DELETE /api/students/:id/photo — admin only
// Clears the student's photo field.
export async function DELETE(req, context) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  try {
    await connectDB();
    const { id } = await context.params;

    const student = await Student.findByIdAndUpdate(
      id,
      { $set: { photo: null } },
      { new: true }
    ).lean();

    if (!student) {
      return withCors(NextResponse.json({ error: "Student not found." }, { status: 404 }));
    }

    return withCors(NextResponse.json({ success: true }));
  } catch (err) {
    console.error("Student photo delete error:", err);
    return withCors(NextResponse.json({ error: "Delete failed." }, { status: 500 }));
  }
}
