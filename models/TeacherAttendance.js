import mongoose from "mongoose";

// Tracks daily attendance for teachers (separate from student Attendance model).
// A teacher marks their own attendance; admin can view all.
// date format: "YYYY-MM-DD"

const TeacherAttendanceSchema = new mongoose.Schema(
  {
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
      required: true,
    },
    date: {
      type: String,
      required: true, // YYYY-MM-DD
    },
    status: {
      type: String,
      enum: ["Present", "Absent", "Leave"],
      required: true,
    },
    note: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true }
);

// Unique: one record per teacher per day
TeacherAttendanceSchema.index({ teacherId: 1, date: 1 }, { unique: true });
// Admin report queries — filter by teacher over a date range
TeacherAttendanceSchema.index({ teacherId: 1, date: 1 });
// Admin queries filtered by date only (all teachers on a given day)
TeacherAttendanceSchema.index({ date: 1 });

export default mongoose.models.TeacherAttendance ||
  mongoose.model("TeacherAttendance", TeacherAttendanceSchema);
