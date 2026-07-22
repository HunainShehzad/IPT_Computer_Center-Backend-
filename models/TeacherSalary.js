import mongoose from "mongoose";

// Stores the configured monthly salary for each teacher.
// One document per teacher per month — upserted by (teacherId + month).
// month format: "Jan 2025" (matches the fee module convention)

const TeacherSalarySchema = new mongoose.Schema(
  {
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
      required: true,
    },
    month: {
      type: String,
      required: true, // e.g. "Jan 2025"
    },
    monthlySalary: {
      type: Number,
      required: true,
      min: [0, "Salary cannot be negative."],
    },
    status: {
      type: String,
      enum: ["Paid", "Unpaid"],
      default: "Unpaid",
    },
    // Stamped when status transitions to "Paid".
    // Preserved on subsequent saves so the original payment date is never overwritten.
    // Cleared back to null if status is set back to "Unpaid".
    paidDate: {
      type: Date,
      default: null,
    },
    note: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true }
);

// One salary record per teacher per month
TeacherSalarySchema.index({ teacherId: 1, month: 1 }, { unique: true });
// Admin list queries filtered by month
TeacherSalarySchema.index({ month: 1 });

export default mongoose.models.TeacherSalary ||
  mongoose.model("TeacherSalary", TeacherSalarySchema);
