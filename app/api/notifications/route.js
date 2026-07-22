import { connectDB } from "@/lib/db";
import Notification from "@/models/Notification";
import { NextResponse } from "next/server";
import { withCors, optionsResponse } from "@/lib/cors";
import { requireAuth, requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return optionsResponse();
}

// ── Serialize a lean Mongoose doc — convert _id / nested ObjectIds to strings ─
function serialize(doc) {
  return {
    ...doc,
    _id:        doc._id.toString(),
    createdAt:  doc.createdAt?.toISOString?.() ?? doc.createdAt,
    updatedAt:  doc.updatedAt?.toISOString?.() ?? doc.updatedAt,
    expiryDate: doc.expiryDate?.toISOString?.() ?? doc.expiryDate ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/notifications
// Query: page, limit, search, sort (newest|oldest)
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request) {
  const { token, error } = await requireAuth(request);
  if (error) return error;

  await connectDB();

  const { searchParams } = new URL(request.url);
  const page  = Math.max(1, parseInt(searchParams.get("page")  || "1",  10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
  const search = (searchParams.get("search") || "").trim();
  const sort   = searchParams.get("sort") === "oldest" ? { createdAt: 1 } : { createdAt: -1 };

  const now = new Date();

  // Build visibility filter
  const match = {
    isActive: true,
    $or: [{ expiryDate: null }, { expiryDate: { $gt: now } }],
  };

  // Non-admin teachers only see notifications addressed to them or "all"
  if (token.role !== "admin") {
    const userId = String(token.id || token.sub);
    match.$and = [{
      $or: [
        { audience: "all" },
        { audience: "selected", recipients: userId },
      ],
    }];
  }

  // Free-text search on title / message
  if (search) {
    const re = new RegExp(search, "i");
    const cond = { $or: [{ title: re }, { message: re }] };
    if (match.$and) match.$and.push(cond);
    else match.$and = [cond];
  }

  const skip = (page - 1) * limit;

  const [docs, total] = await Promise.all([
    Notification.find(match).sort(sort).skip(skip).limit(limit).lean(),
    Notification.countDocuments(match),
  ]);

  return withCors(
    NextResponse.json({
      notifications: docs.map(serialize),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/notifications — Admin only
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request) {
  const { token, error } = await requireAdmin(request);
  if (error) return error;

  await connectDB();

  let body;
  try { body = await request.json(); }
  catch { return withCors(NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })); }

  const { title, message, priority, audience, recipients, expiryDate } = body;

  if (!title?.trim())
    return withCors(NextResponse.json({ error: "title is required." }, { status: 400 }));
  if (title.trim().length > 200)
    return withCors(NextResponse.json({ error: "title must be 200 characters or fewer." }, { status: 400 }));
  if (!message?.trim())
    return withCors(NextResponse.json({ error: "message is required." }, { status: 400 }));

  const validPriorities = ["low", "medium", "high", "urgent"];
  if (priority && !validPriorities.includes(priority))
    return withCors(NextResponse.json({ error: `priority must be one of: ${validPriorities.join(", ")}.` }, { status: 400 }));

  const validAudiences = ["all", "selected"];
  if (audience && !validAudiences.includes(audience))
    return withCors(NextResponse.json({ error: `audience must be one of: ${validAudiences.join(", ")}.` }, { status: 400 }));

  if (audience === "selected" && (!Array.isArray(recipients) || recipients.length === 0))
    return withCors(NextResponse.json({ error: "recipients required when audience is 'selected'." }, { status: 400 }));

  let parsedExpiry = null;
  if (expiryDate) {
    parsedExpiry = new Date(expiryDate);
    if (isNaN(parsedExpiry.getTime()))
      return withCors(NextResponse.json({ error: "expiryDate must be a valid ISO date string." }, { status: 400 }));
    if (parsedExpiry <= new Date())
      return withCors(NextResponse.json({ error: "expiryDate must be in the future." }, { status: 400 }));
  }

  const doc = await Notification.create({
    title:         title.trim(),
    message:       message.trim(),
    priority:      priority    || "medium",
    audience:      audience    || "all",
    recipients:    audience === "selected" ? recipients.map(String) : [],
    createdBy:     String(token.id || token.sub),
    createdByName: token.name  || "Admin",
    isActive:      true,
    expiryDate:    parsedExpiry,
  });

  return withCors(NextResponse.json(serialize(doc.toObject()), { status: 201 }));
}
