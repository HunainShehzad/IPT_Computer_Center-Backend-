import { connectDB } from "@/lib/db";
import Notification from "@/models/Notification";
import { NextResponse } from "next/server";
import { withCors, optionsResponse } from "@/lib/cors";
import { requireAuth, requireAdmin } from "@/lib/auth";
import mongoose from "mongoose";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return optionsResponse();
}

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function serialize(doc) {
  const obj = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    ...obj,
    _id:        obj._id.toString(),
    createdAt:  obj.createdAt?.toISOString?.() ?? obj.createdAt,
    updatedAt:  obj.updatedAt?.toISOString?.() ?? obj.updatedAt,
    expiryDate: obj.expiryDate?.toISOString?.() ?? obj.expiryDate ?? null,
  };
}

// ── GET /api/notifications/:id ─────────────────────────────────────────────
export async function GET(request, { params }) {
  const { token, error } = await requireAuth(request);
  if (error) return error;

  const { id } = await params;
  if (!isValidId(id))
    return withCors(NextResponse.json({ error: "Invalid notification ID." }, { status: 400 }));

  await connectDB();

  const doc = await Notification.findById(id).lean();
  if (!doc)
    return withCors(NextResponse.json({ error: "Notification not found." }, { status: 404 }));

  // Visibility check for teachers
  if (token.role !== "admin") {
    const now = new Date();
    if (!doc.isActive || (doc.expiryDate && doc.expiryDate <= now))
      return withCors(NextResponse.json({ error: "Notification not found." }, { status: 404 }));

    const userId = String(token.id || token.sub);
    const canSee = doc.audience === "all" ||
      (doc.audience === "selected" && doc.recipients.includes(userId));
    if (!canSee)
      return withCors(NextResponse.json({ error: "Access denied." }, { status: 403 }));
  }

  return withCors(NextResponse.json(serialize(doc)));
}

// ── PUT /api/notifications/:id — Admin only ────────────────────────────────
export async function PUT(request, { params }) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  const { id } = await params;
  if (!isValidId(id))
    return withCors(NextResponse.json({ error: "Invalid notification ID." }, { status: 400 }));

  await connectDB();

  const doc = await Notification.findById(id);
  if (!doc)
    return withCors(NextResponse.json({ error: "Notification not found." }, { status: 404 }));

  let body;
  try { body = await request.json(); }
  catch { return withCors(NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })); }

  const { title, message, priority, audience, recipients, expiryDate, isActive } = body;

  if (title !== undefined) {
    if (!title?.trim()) return withCors(NextResponse.json({ error: "title cannot be empty." }, { status: 400 }));
    if (title.trim().length > 200) return withCors(NextResponse.json({ error: "title must be 200 characters or fewer." }, { status: 400 }));
    doc.title = title.trim();
  }
  if (message !== undefined) {
    if (!message?.trim()) return withCors(NextResponse.json({ error: "message cannot be empty." }, { status: 400 }));
    doc.message = message.trim();
  }
  const validPriorities = ["low", "medium", "high", "urgent"];
  if (priority !== undefined) {
    if (!validPriorities.includes(priority)) return withCors(NextResponse.json({ error: `priority must be one of: ${validPriorities.join(", ")}.` }, { status: 400 }));
    doc.priority = priority;
  }
  const validAudiences = ["all", "selected"];
  if (audience !== undefined) {
    if (!validAudiences.includes(audience)) return withCors(NextResponse.json({ error: `audience must be one of: ${validAudiences.join(", ")}.` }, { status: 400 }));
    doc.audience = audience;
  }
  if (doc.audience === "selected") {
    const eff = recipients !== undefined ? recipients : doc.recipients;
    if (!Array.isArray(eff) || eff.length === 0)
      return withCors(NextResponse.json({ error: "recipients required when audience is 'selected'." }, { status: 400 }));
    doc.recipients = eff.map(String);
  } else if (recipients !== undefined) {
    doc.recipients = [];
  }
  if (expiryDate !== undefined) {
    if (expiryDate === null) { doc.expiryDate = null; }
    else {
      const p = new Date(expiryDate);
      if (isNaN(p.getTime())) return withCors(NextResponse.json({ error: "expiryDate must be a valid ISO date string." }, { status: 400 }));
      doc.expiryDate = p;
    }
  }
  if (isActive !== undefined) {
    if (typeof isActive !== "boolean") return withCors(NextResponse.json({ error: "isActive must be a boolean." }, { status: 400 }));
    doc.isActive = isActive;
  }

  await doc.save();
  return withCors(NextResponse.json(serialize(doc)));
}

// ── DELETE /api/notifications/:id — Admin only ─────────────────────────────
export async function DELETE(request, { params }) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  const { id } = await params;
  if (!isValidId(id))
    return withCors(NextResponse.json({ error: "Invalid notification ID." }, { status: 400 }));

  await connectDB();

  const doc = await Notification.findByIdAndDelete(id);
  if (!doc)
    return withCors(NextResponse.json({ error: "Notification not found." }, { status: 404 }));

  return withCors(NextResponse.json({ message: "Notification deleted successfully." }));
}
