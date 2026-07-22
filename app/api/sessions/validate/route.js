/**
 * GET /api/sessions/validate
 *
 * Lightweight polling endpoint used by the frontend's useSessionGuard hook.
 * Called every ~15 seconds by every logged-in browser tab.
 *
 * Returns:
 *   200 { valid: true }                            — session is still active
 *   401 { valid: false, code: "SESSION_DISPLACED" } — another device logged in
 *   401 { valid: false, code: "SESSION_EXPIRED" }   — session expired / not found
 *
 * This endpoint deliberately does NOT use requireAuth() because that helper
 * already returns a generic 401 and we need the specific code field for the
 * frontend to distinguish "displaced" from other 401 reasons.
 *
 * We also skip the lastActiveAt touch here (that's handled by requireAuth on
 * real API calls) to keep this endpoint as cheap as possible.
 */

import { decode } from "next-auth/jwt";
import { connectDB } from "@/lib/db";
import UserSession from "@/models/UserSession";
import { withCors, optionsResponse } from "@/lib/cors";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function OPTIONS(request) {
  return optionsResponse(request.headers.get("origin") || "");
}

export async function GET(request) {
  const origin = request.headers.get("origin") || "";

  // Extract Bearer token
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return withCors(
      NextResponse.json({ valid: false, code: "NO_TOKEN" }, { status: 401 }),
      origin
    );
  }

  let decoded;
  try {
    decoded = await decode({
      token:  authHeader.slice(7).trim(),
      secret: process.env.NEXTAUTH_SECRET,
    });
  } catch {
    decoded = null;
  }

  if (!decoded?.sessionToken || !decoded?.id) {
    return withCors(
      NextResponse.json({ valid: false, code: "INVALID_TOKEN" }, { status: 401 }),
      origin
    );
  }

  try {
    await connectDB();

    const session = await UserSession.findOne({
      sessionToken: decoded.sessionToken,
      userId:       decoded.id,
    })
      .select("status")
      .lean();

    if (!session) {
      return withCors(
        NextResponse.json({ valid: false, code: "SESSION_EXPIRED" }, { status: 401 }),
        origin
      );
    }

    if (session.status !== "active") {
      // Distinguish between "someone else logged in" and "explicit logout"
      const code =
        session.status === "expired" ? "SESSION_DISPLACED" : "SESSION_LOGGED_OUT";
      return withCors(
        NextResponse.json({ valid: false, code }, { status: 401 }),
        origin
      );
    }

    return withCors(NextResponse.json({ valid: true }), origin);
  } catch (err) {
    console.error("[sessions/validate]", err.message);
    // On DB failure, report valid to avoid false-positive logouts
    return withCors(NextResponse.json({ valid: true }), origin);
  }
}
