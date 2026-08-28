import { connectDB } from "@/lib/db";
import Teacher from "@/models/Teacher";
import { NextResponse } from "next/server";
import { withCors, optionsResponse } from "@/lib/cors";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return optionsResponse();
}

/**
 * GET /api/id-card/teachers
 *
 * Search teachers/staff for the ID card generator. Admin only.
 *
 * Query params:
 *   q    — search term matched against name (case-insensitive)
 *   ids  — comma-separated list of teacher _id values (for bulk fetch)
 *
 * Response shape per teacher:
 *   { _id, name, email, phone, department, status, profilePicture }
 */
export async function GET(request) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  await connectDB();

  const { searchParams } = new URL(request.url);
  const q   = searchParams.get("q")?.trim()   || "";
  const ids = searchParams.get("ids")?.trim() || "";

  try {
    let filter = {};

    // Bulk fetch by explicit id list (used when re-hydrating selected teachers)
    if (ids) {
      const idList = ids.split(",").map((s) => s.trim()).filter(Boolean);
      filter._id = { $in: idList };
    } else {
      // Text search on name
      if (q) {
        filter.name = { $regex: q, $options: "i" };
      }
    }

    // Limit results to prevent huge payloads; searching is expected to narrow them down
    const teachers = await Teacher.find(filter)
      .limit(ids ? 0 : 50)   // no limit when fetching by explicit ids
      .lean();

    if (!teachers.length) {
      return withCors(NextResponse.json([]));
    }

    const result = teachers.map((t) => ({
      _id:            String(t._id),
      name:           t.name,
      email:          t.email,
      phone:          t.phone,
      department:     t.department,
      status:         t.status,
      profilePicture: t.profilePicture, // Include teacher photo for ID card display
      username:       t.username,       // Can be used as employee ID
    }));

    return withCors(NextResponse.json(result));
  } catch (err) {
    console.error("[id-card/teachers] GET error:", err);
    return withCors(
      NextResponse.json({ error: "Failed to fetch teachers" }, { status: 500 })
    );
  }
}