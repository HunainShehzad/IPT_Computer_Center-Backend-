import mongoose from "mongoose";

/**
 * UserSession — tracks login activity for every user (admin + teachers).
 *
 * DEDUPLICATION STRATEGY
 * ──────────────────────
 * Instead of creating a new document on every login, we use an upsert keyed
 * on { userId, deviceFingerprint }.  If the same browser on the same device
 * logs in again, the existing record is updated (loginAt, lastActiveAt,
 * sessionToken, ipAddress, status) rather than duplicated.
 *
 * A new record is only created when browser, OS, or device type changes —
 * i.e., the deviceFingerprint is different.
 *
 * Fields
 * ──────
 * userId            — Teacher._id or "admin"
 * role              — "admin" | "teacher"
 * sessionToken      — UUID; refreshed on every login of this device
 * deviceFingerprint — dedup key: "<browser>|<version>|<os>|<deviceType>" (lowercase)
 * deviceName        — "Desktop" | "Mobile" | "Tablet"  (alias of deviceType)
 * deviceType        — "Desktop" | "Mobile" | "Tablet"
 * browser           — e.g. "Google Chrome", "Mozilla Firefox"
 * browserVersion    — major version, e.g. "125"
 * os                — e.g. "Windows 10/11", "macOS 14.4", "Android 14"
 * ipAddress         — updated on every login
 * location          — optional geo info
 * loginAt           — updated on every login (not just the first)
 * lastActiveAt      — touched on every authenticated API request
 * logoutAt          — set when session is explicitly or forcibly ended
 * status            — "active" | "expired" | "logged_out"
 */
const UserSessionSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    role:   { type: String, enum: ["admin", "teacher"], required: true },

    sessionToken: { type: String, required: true, unique: true, index: true },

    // Dedup key — same browser+version+os+deviceType on same account = same record
    deviceFingerprint: { type: String, required: true },

    deviceName:     { type: String, default: "Desktop" },
    deviceType:     { type: String, default: "Desktop" },
    browser:        { type: String, default: "Unknown Browser" },
    browserVersion: { type: String, default: "" },
    os:             { type: String, default: "Unknown OS" },
    ipAddress:      { type: String, default: "unknown" },
    location:       { type: String, default: null },

    loginAt:      { type: Date, default: Date.now },
    lastActiveAt: { type: Date, default: Date.now },
    logoutAt:     { type: Date, default: null },

    status: {
      type:    String,
      enum:    ["active", "expired", "logged_out"],
      default: "active",
      index:   true,
    },
  },
  { timestamps: true }
);

// Compound index for the most common query: find active session for a user
UserSessionSchema.index({ userId: 1, status: 1 });

// Dedup index: one record per user+device fingerprint combination
UserSessionSchema.index({ userId: 1, deviceFingerprint: 1 }, { unique: true });

export default mongoose.models.UserSession ||
  mongoose.model("UserSession", UserSessionSchema);
