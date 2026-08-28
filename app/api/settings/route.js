import { connectDB } from "@/lib/db";
import Settings from "@/models/Settings";
import { NextResponse } from "next/server";
import { withCors, optionsResponse } from "@/lib/cors";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return optionsResponse();
}

/**
 * GET /api/settings?key=principalSignature
 *
 * Returns the value for the requested setting key.
 * Admin only.
 *
 * Response: { key, value }
 */
export async function GET(request) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  await connectDB();

  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key")?.trim();

  if (!key) {
    return withCors(
      NextResponse.json({ error: "key query param is required" }, { status: 400 })
    );
  }

  try {
    const setting = await Settings.findOne({ key }).lean();
    return withCors(
      NextResponse.json({ key, value: setting?.value ?? null })
    );
  } catch (err) {
    console.error("[settings] GET error:", err);
    return withCors(
      NextResponse.json({ error: "Failed to fetch setting" }, { status: 500 })
    );
  }
}

/**
 * PUT /api/settings
 *
 * Upserts a setting key/value pair.
 * Admin only.
 *
 * Body: { key: string, value: string | null }
 *
 * Pass value: null to clear a setting.
 */
export async function PUT(request) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  await connectDB();

  try {
    const body = await request.json();
    const { key, value } = body;

    if (!key?.trim()) {
      return withCors(
        NextResponse.json({ error: "key is required" }, { status: 400 })
      );
    }

    // value can be null (clears the setting), a base64 data URI, or a URL string
    const updated = await Settings.findOneAndUpdate(
      { key: key.trim() },
      { value: value ?? null },
      { upsert: true, new: true }
    ).lean();

    return withCors(NextResponse.json({ key: updated.key, value: updated.value }));
  } catch (err) {
    console.error("[settings] PUT error:", err);
    return withCors(
      NextResponse.json({ error: "Failed to update setting" }, { status: 500 })
    );
  }
}
