import mongoose from "mongoose";

const AttendanceSchema = new mongoose.Schema({
  date: { type: String, required: true },       // Format: YYYY-MM-DD
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
  batchId:   { type: mongoose.Schema.Types.ObjectId, ref: "Batch",   required: true },
  status: { type: String, enum: ["Present", "Absent"], required: true },
});

// ── Indexes ──────────────────────────────────────────────────────────────────
// fetchAttendance(batchId, date) — exact match on both fields
AttendanceSchema.index({ batchId: 1, date: 1 });

// fetchAttendanceReport(batchId, from, to) — range query on date within a batch
AttendanceSchema.index({ batchId: 1, date: 1, studentId: 1 });

// Unique constraint prevents duplicate records for the same student/date/batch
AttendanceSchema.index(
  { studentId: 1, batchId: 1, date: 1 },
  { unique: true }
);

export default mongoose.models.Attendance || mongoose.model("Attendance", AttendanceSchema);
