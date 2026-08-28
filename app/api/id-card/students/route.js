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

/**
 * GET /api/id-card/students
 *
 * Search students for the ID card generator. Admin only.
 *
 * Query params:
 *   q        — search term matched against name (case-insensitive)
 *   batchId  — filter by specific batch
 *   ids      — comma-separated list of student _id values (for bulk fetch)
 *
 * Response shape per student:
 *   { _id, name, phone, admissionDate, status,
 *     batch: { _id, name, timing } }
 */
export async function GET(request) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  await connectDB();

  const { searchParams } = new URL(request.url);
  const q       = searchParams.get("q")?.trim()       || "";
  const batchId = searchParams.get("batchId")?.trim() || "";
  const ids     = searchParams.get("ids")?.trim()     || "";

  try {
    let filter = {};

    // Bulk fetch by explicit id list (used when re-hydrating selected students)
    if (ids) {
      const idList = ids.split(",").map((s) => s.trim()).filter(Boolean);
      filter._id = { $in: idList };
    } else {
      // Text search on name
      if (q) {
        filter.name = { $regex: q, $options: "i" };
      }
      // Optional batch filter
      if (batchId) {
        filter.batchId = batchId;
      }
    }

    // Limit results to prevent huge payloads; searching is expected to narrow them down
    const students = await Student.find(filter)
      .limit(ids ? 0 : 50)   // no limit when fetching by explicit ids
      .lean();

    if (!students.length) {
      return withCors(NextResponse.json([]));
    }

    // Collect unique batch ids and fetch them in one query
    const batchIds = [...new Set(students.map((s) => String(s.batchId)))];
    const batches  = await Batch.find({ _id: { $in: batchIds } }).lean();
    const batchMap = Object.fromEntries(batches.map((b) => [String(b._id), b]));

    const result = students.map((s) => {
      const batch = batchMap[String(s.batchId)] || null;
      return {
        _id:           String(s._id),
        name:          s.name,
        phone:         s.phone,
        admissionDate: s.admissionDate,
        status:        s.status,
        photo:         s.photo, // Include student photo for ID card display
        batch: batch
          ? { _id: String(batch._id), name: batch.name, timing: batch.timing }
          : null,
      };
    });

    return withCors(NextResponse.json(result));
  } catch (err) {
    console.error("[id-card/students] GET error:", err);
    return withCors(
      NextResponse.json({ error: "Failed to fetch students" }, { status: 500 })
    );
  }
}

