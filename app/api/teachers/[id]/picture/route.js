import { connectDB } from "@/lib/db";
import Teacher from "@/models/Teacher";
import { NextResponse } from "next/server";
import { withCors, optionsResponse } from "@/lib/cors";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return optionsResponse();
}

// ── shared auth helper ────────────────────────────────────────────────────────
// Admin can update/delete ANY teacher's picture.
// A teacher can only update/delete THEIR OWN picture.
async function authorise(req, targetId) {
  const { token, error } = await requireAuth(req);
  if (error) return { authError: error };

  if (token.role === "admin") return { token };                  // admin: allowed always
  if (String(token.id) === String(targetId)) return { token };  // teacher: own profile only

  return {
    authError: withCors(
      NextResponse.json({ error: "Access denied." }, { status: 403 })
    ),
  };
}

// POST /api/teachers/:id/picture — admin OR the teacher themselves
export async function POST(req, context) {
  const { id } = await context.params;
  const { token, authError } = await authorise(req, id);
  if (authError) return authError;

  try {
    await connectDB();

    const formData = await req.formData();
    const file = formData.get("picture");

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

    const teacher = await Teacher.findByIdAndUpdate(
      id,
      { $set: { profilePicture: base64 } },
      { new: true }
    ).lean();

    if (!teacher) {
      return withCors(NextResponse.json({ error: "Teacher not found." }, { status: 404 }));
    }

    const { passwordHash, plainPassword, ...safe } = teacher;
    return withCors(NextResponse.json({ success: true, profilePicture: safe.profilePicture }));
  } catch (err) {
    console.error("Picture upload error:", err);
    return withCors(NextResponse.json({ error: "Upload failed." }, { status: 500 }));
  }
}

// DELETE /api/teachers/:id/picture — admin OR the teacher themselves
export async function DELETE(req, context) {
  const { id } = await context.params;
  const { authError } = await authorise(req, id);
  if (authError) return authError;

  try {
    await connectDB();

    const teacher = await Teacher.findByIdAndUpdate(
      id,
      { $set: { profilePicture: null } },
      { new: true }
    ).lean();

    if (!teacher) {
      return withCors(NextResponse.json({ error: "Teacher not found." }, { status: 404 }));
    }

    return withCors(NextResponse.json({ success: true }));
  } catch (err) {
    console.error("Picture delete error:", err);
    return withCors(NextResponse.json({ error: "Delete failed." }, { status: 500 }));
  }
}
