import { connectDB } from "@/lib/db";
import Teacher from "@/models/Teacher";
import UserSession from "@/models/UserSession";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { withCors, optionsResponse } from "@/lib/cors";
import { checkRateLimit, rateLimitResponse, getClientIp } from "@/lib/auth";
import { parseUserAgent, buildDeviceFingerprint } from "@/lib/parseUserAgent";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

export function OPTIONS(request) {
  return optionsResponse(request.headers.get("origin") || "");
}

/**
 * Upsert the session for a given user + device fingerprint.
 *
 * Logic:
 *  - If a record with { userId, deviceFingerprint } already exists:
 *      → Reuse it (update sessionToken, loginAt, lastActiveAt, ipAddress, status)
 *      → Expire all OTHER active sessions for this user
 *  - If no such record exists:
 *      → Expire all currently active sessions for this user
 *      → Insert a new record
 *
 * Returns the sessionToken that should be embedded in the JWT.
 */
async function upsertSession({ userId, role, deviceFingerprint, deviceType, deviceName, browser, browserVersion, os, ipAddress }) {
  const now          = new Date();
  const sessionToken = randomUUID();

  // Step 1: try to find an existing record for this device fingerprint
  const existing = await UserSession.findOne({ userId, deviceFingerprint });

  if (existing) {
    // Same device/browser re-login — update in place, no new row
    await UserSession.updateOne(
      { _id: existing._id },
      {
        $set: {
          sessionToken,
          ipAddress,
          loginAt:      now,
          lastActiveAt: now,
          logoutAt:     null,
          status:       "active",
          // Refresh parsed fields in case the browser updated its minor version
          browserVersion,
          os,
          deviceType,
          deviceName,
        },
      }
    );

    // Expire all OTHER active sessions for this user (different devices)
    await UserSession.updateMany(
      {
        userId,
        deviceFingerprint: { $ne: deviceFingerprint },
        status: "active",
      },
      { $set: { status: "expired", logoutAt: now } }
    );
  } else {
    // New device/browser — expire any current active sessions first
    await UserSession.updateMany(
      { userId, status: "active" },
      { $set: { status: "expired", logoutAt: now } }
    );

    // Insert new record
    await UserSession.create({
      userId,
      role,
      sessionToken,
      deviceFingerprint,
      deviceType,
      deviceName,
      browser,
      browserVersion,
      os,
      ipAddress,
      loginAt:      now,
      lastActiveAt: now,
      status:       "active",
    });
  }

  return sessionToken;
}

// POST /api/auth/validate
// Validates credentials then upserts the UserSession record.
export async function POST(request) {
  const origin = request.headers.get("origin") || "";
  const ip     = getClientIp(request);

  // Rate limit: 10 attempts per IP per 60 s
  const { limited, resetAt } = checkRateLimit(`login:${ip}`, 10, 60_000);
  if (limited) return rateLimitResponse(resetAt);

  let body;
  try {
    body = await request.json();
  } catch {
    return withCors(
      NextResponse.json({ error: "Invalid request body" }, { status: 400 }),
      origin
    );
  }

  const { username, password } = body;

  if (!username || !password) {
    return withCors(
      NextResponse.json({ error: "username and password are required" }, { status: 400 }),
      origin
    );
  }
  if (typeof username !== "string" || username.length > 64) {
    return withCors(NextResponse.json({ error: "Invalid credentials" }, { status: 401 }), origin);
  }
  if (typeof password !== "string" || password.length > 128) {
    return withCors(NextResponse.json({ error: "Invalid credentials" }, { status: 401 }), origin);
  }

  // ── Parse device info ──────────────────────────────────────────────────
  // Check the Sec-CH-UA header for Brave detection — Brave's UA string is
  // identical to Chrome's but the Sec-CH-UA hint contains "Brave".
  const rawUA      = request.headers.get("user-agent") || "";
  const secCHUA    = request.headers.get("sec-ch-ua") || "";
  const isBrave    = /brave/i.test(secCHUA);

  // Append "[brave]" sentinel to UA string so the parser can detect it
  const ua = isBrave ? `${rawUA} [brave]` : rawUA;

  const { browser, browserVersion, os, deviceType, deviceName } = parseUserAgent(ua);
  const deviceFingerprint = buildDeviceFingerprint({ browser, browserVersion, os, deviceType });

  // ── Admin login ────────────────────────────────────────────────────────
  const adminPassword = process.env.ADMIN_PASSWORD || "";
  // Timing-parity hash so response time is identical whether username is "admin" or not
  await bcrypt.hash(adminPassword, 12).catch(() => "");

  if (username === "admin") {
    if (password !== adminPassword) {
      return withCors(
        NextResponse.json({ error: "Invalid credentials" }, { status: 401 }),
        origin
      );
    }

    await connectDB();

    const sessionToken = await upsertSession({
      userId: "admin",
      role:   "admin",
      deviceFingerprint,
      deviceType,
      deviceName,
      browser,
      browserVersion,
      os,
      ipAddress: ip,
    });

    return withCors(
      NextResponse.json({
        id:           "admin",
        name:         "Admin",
        email:        "admin@ipt.com",
        role:         "admin",
        sessionToken,
      }),
      origin
    );
  }

  // ── Teacher login ──────────────────────────────────────────────────────
  await connectDB();

  const teacher = await Teacher.findOne({ username: username.trim() });

  const dummyHash = "$2b$12$invalidhashpaddingtomakethislookreal000000000000000000";
  const hash      = teacher?.passwordHash ?? dummyHash;
  const valid     = await bcrypt.compare(password, hash);

  if (!teacher || teacher.status === "inactive" || !valid) {
    return withCors(
      NextResponse.json({ error: "Invalid credentials" }, { status: 401 }),
      origin
    );
  }

  const sessionToken = await upsertSession({
    userId: teacher._id.toString(),
    role:   "teacher",
    deviceFingerprint,
    deviceType,
    deviceName,
    browser,
    browserVersion,
    os,
    ipAddress: ip,
  });

  return withCors(
    NextResponse.json({
      id:              teacher._id.toString(),
      name:            teacher.name,
      email:           teacher.email,
      role:            "teacher",
      department:      teacher.department,
      assignedBatches: teacher.assignedBatches.map((b) => b.toString()),
      sessionToken,
    }),
    origin
  );
}
