/**
 * lib/auth.js
 *
 * Reusable authentication and authorization helpers for all backend API routes.
 *
 * SINGLE-ACTIVE-SESSION ENFORCEMENT
 * ───────────────────────────────────
 * Every authenticated request now carries a `sessionToken` field inside the
 * signed JWT (embedded by the frontend NextAuth session callback).  On each
 * request we:
 *   1. Decode the JWT and extract { id, role, sessionToken }.
 *   2. Look up the UserSession document with that sessionToken.
 *   3. If the document is missing OR its status is not "active" → 401 with
 *      error code "SESSION_DISPLACED" so the frontend can show the popup.
 *   4. If valid, touch lastActiveAt so the activity timestamp stays current.
 *
 * USAGE
 * ─────
 * import { requireAuth, requireAdmin, requireTeacher } from "@/lib/auth";
 *
 * const { token, error } = await requireAdmin(request);
 * if (error) return error;   // already a withCors'd 401/403 response
 * // token.id, token.role, token.sessionToken … are available
 */

import { getToken, decode } from "next-auth/jwt";
import { NextResponse } from "next/server";
import { withCors } from "@/lib/cors";
import { connectDB } from "@/lib/db";
import UserSession from "@/models/UserSession";

// ── Internal helpers ───────────────────────────────────────────────────────

async function extractToken(request) {
  try {
    // 1. Bearer header (primary path — cross-origin requests from the frontend)
    const authHeader = request.headers.get("authorization") || "";
    if (authHeader.startsWith("Bearer ")) {
      const jwt = authHeader.slice(7).trim();
      if (jwt) {
        const decoded = await decode({
          token:  jwt,
          secret: process.env.NEXTAUTH_SECRET,
        });
        if (decoded) return decoded;
        console.error(
          "[auth] Bearer token decode failed — check NEXTAUTH_SECRET. Token prefix:",
          jwt.slice(0, 20)
        );
      }
    }

    // 2. Session cookie (same-origin / server-side calls)
    const cookieToken = await getToken({
      req:    request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!cookieToken && !authHeader) {
      console.error("[auth] No Authorization header and no session cookie on:", request.url);
    }
    return cookieToken;
  } catch (err) {
    console.error("[auth] extractToken error:", err.message);
    return null;
  }
}

/**
 * Validates the sessionToken embedded in the JWT against the UserSession
 * collection.  Returns the session document on success, null on failure.
 *
 * Also touches `lastActiveAt` so the activity log stays up-to-date.
 */
async function validateSessionToken(token) {
  // Tokens that pre-date the single-active-session feature won't have a
  // sessionToken field — treat them as invalid to force re-login.
  if (!token?.sessionToken) return null;

  try {
    await connectDB();

    const session = await UserSession.findOne({
      sessionToken: token.sessionToken,
      userId:       token.id,
    }).lean();

    if (!session) return null;
    if (session.status !== "active") return null;

    // Fire-and-forget lastActiveAt update (non-blocking)
    UserSession.updateOne(
      { sessionToken: token.sessionToken },
      { $set: { lastActiveAt: new Date() } }
    ).catch(() => {});

    return session;
  } catch (err) {
    console.error("[auth] validateSessionToken error:", err.message);
    // On DB error, fail open (don't lock everyone out)
    return { _failOpen: true };
  }
}

function unauthorized(message = "Unauthorized", code = null) {
  const body = code ? { error: message, code } : { error: message };
  return withCors(NextResponse.json(body, { status: 401 }));
}

function forbidden(message = "Forbidden") {
  return withCors(NextResponse.json({ error: message }, { status: 403 }));
}

// ── Core auth helper (shared by all role-specific helpers) ─────────────────

async function coreAuth(request) {
  const token = await extractToken(request);
  if (!token) return { token: null, error: unauthorized() };

  const session = await validateSessionToken(token);
  if (!session) {
    return {
      token: null,
      error: unauthorized(
        "Your session has been ended because your account logged in on another device.",
        "SESSION_DISPLACED"
      ),
    };
  }

  return { token, error: null };
}

// ── Public helpers ─────────────────────────────────────────────────────────

/**
 * Requires any valid, active JWT session (admin OR teacher).
 */
export async function requireAuth(request) {
  return coreAuth(request);
}

/**
 * Requires a valid, active JWT session with role === "admin".
 */
export async function requireAdmin(request) {
  const { token, error } = await coreAuth(request);
  if (error) return { token: null, error };
  if (token.role !== "admin") {
    return { token: null, error: forbidden("Admin access required") };
  }
  return { token, error: null };
}

/**
 * Requires a valid, active JWT session with role === "teacher".
 */
export async function requireTeacher(request) {
  const { token, error } = await coreAuth(request);
  if (error) return { token: null, error };
  if (token.role !== "teacher") {
    return { token: null, error: forbidden("Teacher access required") };
  }
  return { token, error: null };
}

// ── Rate limiter (unchanged) ───────────────────────────────────────────────

const _rateLimitStore = new Map();

export function checkRateLimit(key, limit = 10, windowMs = 60_000) {
  const now   = Date.now();
  const entry = _rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    _rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false, remaining: limit - 1, resetAt: now + windowMs };
  }

  entry.count += 1;
  const remaining = Math.max(0, limit - entry.count);
  return { limited: entry.count > limit, remaining, resetAt: entry.resetAt };
}

export function rateLimitResponse(resetAt) {
  const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
  const res = withCors(
    NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    )
  );
  res.headers.set("Retry-After", String(retryAfter));
  return res;
}

/**
 * Extracts the client IP from a Next.js request.
 */
export function getClientIp(request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
