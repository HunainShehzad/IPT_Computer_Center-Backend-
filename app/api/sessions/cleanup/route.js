/**
 * POST /api/sessions/cleanup
 *
 * Admin-only utility that marks any "active" session whose lastActiveAt is
 * older than SESSION_IDLE_HOURS (default 24 h) as "expired".
 *
 * This can be called:
 *   - Manually from the admin Login Activity page
 *   - By a cron job / scheduled task
 *
 * It is intentionally lightweight — no external scheduler dependency.
 */

import { connectDB } from "@/lib/db";
import UserSession from "@/models/UserSession";
import { requireAdmin } from "@/lib/auth";
import { withCors, optionsResponse } from "@/lib/cors";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SESSION_IDLE_HOURS = Number(process.env.SESSION_IDLE_HOURS ?? 24);

export function OPTIONS(request) {
  return optionsResponse(request.headers.get("origin") || "");
}

export async function POST(request) {
  const origin = request.headers.get("origin") || "";
  const { error } = await requireAdmin(request);
  if (error) return error;

  try {
    await connectDB();

    const cutoff = new Date(Date.now() - SESSION_IDLE_HOURS * 60 * 60 * 1000);
    const result = await UserSession.updateMany(
      { status: "active", lastActiveAt: { $lt: cutoff } },
      { $set: { status: "expired", logoutAt: new Date() } }
    );

    return withCors(
      NextResponse.json({
        success:  true,
        expired:  result.modifiedCount,
        message:  `${result.modifiedCount} idle session(s) expired.`,
      }),
      origin
    );
  } catch (err) {
    console.error("[sessions/cleanup]", err.message);
    return withCors(
      NextResponse.json({ error: "Cleanup failed" }, { status: 500 }),
      origin
    );
  }
}
