/**
 * proxy.js — Backend edge proxy (Next.js 16 convention, replaces middleware.js)
 *
 * Responsibilities:
 *  1. Inject CORS headers on every /api/* response so both localhost:3000
 *     and the LAN IP (192.168.2.147:3000) can call the backend.
 *  2. Allow OPTIONS preflight requests through unconditionally.
 *  3. Protect all /api/* routes with JWT validation — public routes are
 *     exempt (see PUBLIC_PREFIXES).
 */

import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";

// ── Origin allow-list ──────────────────────────────────────────────────────
// Keep in sync with FRONTEND_URL / FRONTEND_URL_LAN in .env.local.
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL     || "http://localhost:3000",
  process.env.FRONTEND_URL_LAN || "http://192.168.2.147:3000",
  "http://localhost:3000",              // always allow local dev
  "http://192.168.2.147:3000",         // always allow LAN dev
];

function getAllowedOrigin(requestOrigin) {
  // Deduplicate: use a Set when checking
  const allowed = [...new Set(ALLOWED_ORIGINS)];
  return allowed.includes(requestOrigin)
    ? requestOrigin
    : allowed[0];
}

function corsHeaders(requestOrigin) {
  return {
    "Access-Control-Allow-Origin":      getAllowedOrigin(requestOrigin),
    "Access-Control-Allow-Methods":     "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":     "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Vary":                             "Origin",
  };
}

// ── Public routes — no JWT required ────────────────────────────────────────
const PUBLIC_PREFIXES = ["/api/auth", "/api/health"];

// ── Main proxy handler ─────────────────────────────────────────────────────
export async function proxy(request) {
  const { pathname } = request.nextUrl;
  const reqMethod   = request.method;
  const origin      = request.headers.get("origin") || "";

  // Always allow OPTIONS preflight — browser needs CORS headers before
  // sending the real request.
  if (reqMethod === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: corsHeaders(origin),
    });
  }

  // Public routes — pass straight through, CORS headers added below.
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    const response = NextResponse.next();
    Object.entries(corsHeaders(origin)).forEach(([k, v]) =>
      response.headers.set(k, v)
    );
    return response;
  }

  // Protected routes — require a valid JWT.
  let token = null;
  try {
    // 1. Try Authorization: Bearer <jwt> header first (used by the frontend).
    const authHeader = request.headers.get("authorization") || "";
    if (authHeader.startsWith("Bearer ")) {
      const { decode } = await import("next-auth/jwt");
      const jwt = authHeader.slice(7).trim();
      if (jwt) {
        token = await decode({ token: jwt, secret: process.env.NEXTAUTH_SECRET });
      }
    }

    // 2. Fall back to session cookie.
    if (!token) {
      token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    }
  } catch {
    token = null;
  }

  if (!token) {
    return new NextResponse(
      JSON.stringify({ error: "Unauthorized" }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(origin),
        },
      }
    );
  }

  // Authenticated — continue to the route handler, inject CORS headers.
  const response = NextResponse.next();
  Object.entries(corsHeaders(origin)).forEach(([k, v]) =>
    response.headers.set(k, v)
  );
  return response;
}

export const config = { matcher: ["/api/:path*"] };
