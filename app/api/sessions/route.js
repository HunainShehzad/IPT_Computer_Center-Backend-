/**
 * GET  /api/sessions          — list all sessions for the authenticated user
 * POST /api/sessions/logout   — force-logout a specific session by its _id
 *
 * Any authenticated user (admin or teacher) can query their OWN sessions.
 * Admin can also query any user's sessions by passing ?userId=<id>.
 */

import { connectDB } from "@/lib/db";
import UserSession from "@/models/UserSession";
import { requireAuth } from "@/lib/auth";
import { withCors, optionsResponse } from "@/lib/cors";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function OPTIONS(request) {
  return optionsResponse(request.headers.get("origin") || "");
}

// ── GET /api/sessions ──────────────────────────────────────────────────────
// Returns all sessions for the calling user, newest first.
// Admins may pass ?userId=<id> to query another user.
export async function GET(request) {
  const origin = request.headers.get("origin") || "";
  const { token, error } = await requireAuth(request);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const requestedUserId = searchParams.get("userId");

  // Only admin can look up sessions for other users
  let targetUserId = token.id;
  if (requestedUserId && requestedUserId !== token.id) {
    if (token.role !== "admin") {
      return withCors(
        NextResponse.json({ error: "Forbidden" }, { status: 403 }),
        origin
      );
    }
    targetUserId = requestedUserId;
  }

  try {
    await connectDB();

    const sessions = await UserSession.find({ userId: targetUserId })
      .sort({ loginAt: -1 })
      .lean();

    // Mark which session is the caller's current one
    const result = sessions.map((s) => ({
      _id:               s._id.toString(),
      userId:            s.userId,
      role:              s.role,
      deviceName:        s.deviceName  || "Desktop",
      deviceType:        s.deviceType  || s.deviceName || "Desktop",
      browser:           s.browser     || "Unknown Browser",
      browserVersion:    s.browserVersion || "",
      os:                s.os          || "Unknown OS",
      ipAddress:         s.ipAddress,
      location:          s.location    || null,
      loginAt:           s.loginAt,
      lastActiveAt:      s.lastActiveAt,
      logoutAt:          s.logoutAt    || null,
      status:            s.status,
      isCurrent:         s.sessionToken === token.sessionToken,
    }));

    return withCors(NextResponse.json({ sessions: result }), origin);
  } catch (err) {
    console.error("[sessions GET]", err.message);
    return withCors(
      NextResponse.json({ error: "Failed to fetch sessions" }, { status: 500 }),
      origin
    );
  }
}

// ── DELETE /api/sessions ───────────────────────────────────────────────────
// Force-logout a specific session by _id.
// Body: { sessionId: "<mongo _id>" }
// Users can only log out their own sessions; admins can log out any.
export async function DELETE(request) {
  const origin = request.headers.get("origin") || "";
  const { token, error } = await requireAuth(request);
  if (error) return error;

  let body;
  try {
    body = await request.json();
  } catch {
    return withCors(
      NextResponse.json({ error: "Invalid request body" }, { status: 400 }),
      origin
    );
  }

  const { sessionId } = body;
  if (!sessionId) {
    return withCors(
      NextResponse.json({ error: "sessionId is required" }, { status: 400 }),
      origin
    );
  }

  try {
    await connectDB();

    const session = await UserSession.findById(sessionId);
    if (!session) {
      return withCors(
        NextResponse.json({ error: "Session not found" }, { status: 404 }),
        origin
      );
    }

    // Non-admins can only manage their own sessions
    if (token.role !== "admin" && session.userId !== token.id) {
      return withCors(
        NextResponse.json({ error: "Forbidden" }, { status: 403 }),
        origin
      );
    }

    // Can't force-logout the current session via this endpoint
    // (use normal signOut flow for that)
    if (session.sessionToken === token.sessionToken) {
      return withCors(
        NextResponse.json(
          { error: "Use the normal logout flow to end your current session." },
          { status: 400 }
        ),
        origin
      );
    }

    await UserSession.updateOne(
      { _id: sessionId },
      { $set: { status: "logged_out", logoutAt: new Date() } }
    );

    return withCors(
      NextResponse.json({ success: true, message: "Session logged out." }),
      origin
    );
  } catch (err) {
    console.error("[sessions DELETE]", err.message);
    return withCors(
      NextResponse.json({ error: "Failed to logout session" }, { status: 500 }),
      origin
    );
  }
}
