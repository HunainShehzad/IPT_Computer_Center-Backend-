import { connectDB } from "@/lib/db";
import Teacher from "@/models/Teacher";
import Batch from "@/models/Batch";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sendTeacherCredentials } from "@/lib/mailer";
import { withCors, optionsResponse } from "@/lib/cors";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return optionsResponse();
}

// GET /api/teachers — admin only
export async function GET(request) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  await connectDB();
  const teachers = await Teacher.find()
    .populate("assignedBatches", "name timing department")
    .lean();

  // Strip sensitive fields before sending
  return withCors(
    NextResponse.json(
      teachers.map(({ passwordHash, plainPassword, ...t }) => t)
    )
  );
}

// POST /api/teachers — admin only
export async function POST(request) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  await connectDB();
  const body = await request.json();
  const { name, email, phone, department, assignedBatches, username, monthlySalary } = body;

  // Input validation
  if (!name?.trim() || !email?.trim() || !phone?.trim() || !department || !username?.trim()) {
    return withCors(NextResponse.json({ error: "All fields are required" }, { status: 400 }));
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return withCors(NextResponse.json({ error: "Invalid email address" }, { status: 400 }));
  }

  // Check uniqueness
  const exists = await Teacher.findOne({
    $or: [{ email: email.toLowerCase().trim() }, { username: username.trim() }],
  });
  if (exists) {
    return withCors(
      NextResponse.json({ error: "Email or username already exists" }, { status: 409 })
    );
  }

  const rawPassword = generatePassword();
  const passwordHash = await bcrypt.hash(rawPassword, 12);

  const teacher = await Teacher.create({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    phone: phone.trim(),
    department,
    assignedBatches: assignedBatches || [],
    username: username.trim(),
    passwordHash,
    role: "teacher",
    status: "active",
    // Store the fixed monthly salary on the teacher record (0 if not provided)
    monthlySalary: typeof monthlySalary === "number" && monthlySalary >= 0
      ? monthlySalary
      : 0,
  });

  // Fetch batch names for the welcome email
  let batchNames = [];
  if (assignedBatches?.length) {
    const batches = await Batch.find({ _id: { $in: assignedBatches } }, "name").lean();
    batchNames = batches.map((b) => b.name);
  }

  try {
    await sendTeacherCredentials({
      name: teacher.name,
      email: teacher.email,
      username: teacher.username,
      password: rawPassword,
      department: teacher.department,
      batches: batchNames,
    });
  } catch (emailErr) {
    console.error("Email send failed:", emailErr.message);
    // Teacher is already created — don't fail the request
  }

  const { passwordHash: _, ...safeTeacher } = teacher.toObject();
  return withCors(
    NextResponse.json({ ...safeTeacher, tempPassword: rawPassword }, { status: 201 })
  );
}

function generatePassword() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#!";
  let pass = "";
  for (let i = 0; i < 10; i++) {
    pass += chars[Math.floor(Math.random() * chars.length)];
  }
  return pass;
}
