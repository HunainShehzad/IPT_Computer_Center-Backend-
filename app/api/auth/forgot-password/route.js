import { connectDB } from "@/lib/db";
import Teacher from "@/models/Teacher";
import { NextResponse } from "next/server";
import { sendOtpEmail } from "@/lib/mailer";
import { withCors, optionsResponse } from "@/lib/cors";
import { checkRateLimit, rateLimitResponse, getClientIp } from "@/lib/auth";

export const dynamic = "force-dynamic";

// OTP store: email → { otp, expiresAt, attempts }
// Using attempts counter prevents brute-force guessing of the 6-digit code.
const otpStore = new Map();

export function OPTIONS() {
  return optionsResponse();
}

// POST /api/auth/forgot-password
// Step 1 — send OTP:              { email }
// Step 2 — verify + reset:        { email, otp, newPassword }
export async function POST(request) {
  const ip = getClientIp(request);

  // Global rate limit per IP: 20 requests per 15 minutes
  const { limited, resetAt } = checkRateLimit(`otp:${ip}`, 20, 15 * 60_000);
  if (limited) return rateLimitResponse(resetAt);

  let body;
  try {
    body = await request.json();
  } catch {
    return withCors(NextResponse.json({ error: "Invalid request body" }, { status: 400 }));
  }

  const { email, otp, newPassword } = body;

  if (!email || typeof email !== "string" || email.length > 254) {
    return withCors(NextResponse.json({ error: "A valid email is required" }, { status: 400 }));
  }

  const normalizedEmail = email.toLowerCase().trim();

  // ── STEP 2: verify OTP + set new password ─────────────────────────────
  if (otp !== undefined && newPassword !== undefined) {
    const entry = otpStore.get(normalizedEmail);

    if (!entry) {
      return withCors(
        NextResponse.json({ error: "No OTP found. Please request a new one." }, { status: 400 })
      );
    }

    // Expire check
    if (Date.now() > entry.expiresAt) {
      otpStore.delete(normalizedEmail);
      return withCors(
        NextResponse.json({ error: "OTP has expired. Please request a new one." }, { status: 400 })
      );
    }

    // Brute-force protection: max 5 wrong attempts per OTP
    if (entry.attempts >= 5) {
      otpStore.delete(normalizedEmail);
      return withCors(
        NextResponse.json(
          { error: "Too many incorrect attempts. Please request a new OTP." },
          { status: 429 }
        )
      );
    }

    if (String(entry.otp) !== String(otp)) {
      entry.attempts += 1;
      return withCors(NextResponse.json({ error: "Invalid OTP. Please try again." }, { status: 400 }));
    }

    // OTP is valid — validate new password
    if (typeof newPassword !== "string" || newPassword.length < 6) {
      return withCors(
        NextResponse.json({ error: "New password must be at least 6 characters" }, { status: 400 })
      );
    }
    if (newPassword.length > 128) {
      return withCors(NextResponse.json({ error: "Password is too long" }, { status: 400 }));
    }

    const bcrypt = await import("bcryptjs");
    const passwordHash = await bcrypt.default.hash(newPassword, 12);

    await connectDB();
    const teacher = await Teacher.findOneAndUpdate(
      { email: normalizedEmail },
      { $set: { passwordHash } },
      { new: true }
    );

    if (!teacher) {
      return withCors(NextResponse.json({ error: "Account not found." }, { status: 404 }));
    }

    otpStore.delete(normalizedEmail); // consume OTP after successful use

    return withCors(NextResponse.json({ success: true, message: "Password updated successfully." }));
  }

  // ── STEP 1: generate + send OTP ────────────────────────────────────────
  // Per-email rate limit: max 3 OTP requests per 10 minutes (prevents spam)
  const { limited: emailLimited, resetAt: emailReset } = checkRateLimit(
    `otp-email:${normalizedEmail}`, 3, 10 * 60_000
  );
  if (emailLimited) return rateLimitResponse(emailReset);

  await connectDB();
  const teacher = await Teacher.findOne({ email: normalizedEmail });

  // Don't reveal whether the email exists — always return success
  if (!teacher) {
    return withCors(
      NextResponse.json({
        success: true,
        message: "If this email is registered, an OTP has been sent.",
      })
    );
  }

  const generatedOtp = Math.floor(100_000 + Math.random() * 900_000); // 6-digit
  const expiresAt    = Date.now() + 10 * 60 * 1000; // 10 minutes

  otpStore.set(normalizedEmail, { otp: generatedOtp, expiresAt, attempts: 0 });

  try {
    await sendOtpEmail({ name: teacher.name, email: teacher.email, otp: generatedOtp });
  } catch (err) {
    console.error("OTP email failed:", err.message);
    otpStore.delete(normalizedEmail);
    return withCors(
      NextResponse.json({ error: "Failed to send OTP email. Please try again." }, { status: 500 })
    );
  }

  return withCors(
    NextResponse.json({ success: true, message: "OTP sent to your email." })
  );
}
