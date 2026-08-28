import mongoose from "mongoose";

const StudentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Student ka naam lazmi hai."],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, "Contact number lazmi hai."],
      trim: true,
    },
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Batch",
      required: [true, "Batch assign karna lazmi hai."],
    },
    admissionDate: {
      type: String,
      required: [true, "Admission date lazmi hai."],
    },
    status: {
      type: String,
      enum: ["active", "left"],
      default: "active",
    },
    // Stamped automatically when status transitions to "left".
    // Used by the analytics engine to cap the months a student owes fees for.
    // Cleared back to null if the student is ever re-activated.
    leftDate: {
      type: Date,
      default: null,
    },
    decidedFee: {
      type: Number,
      required: [true, "Decided monthly fee lazmi hai."],
      min: [0, "Fees minus mein nahi ho sakti."],
    },
    // Student photo stored as a base64 data URI (same pattern as Teacher.profilePicture).
    // Null means no photo uploaded yet.
    photo: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// ── Indexes ─────────────────────────────────────────────────────────────────
// fetchStudents(batchId) — most frequent query, needs single-field index
StudentSchema.index({ batchId: 1 });

// fetchStudents(batchId, { activeOnly: true }) — compound index covers both
// the equality filter on batchId AND the status filter
StudentSchema.index({ batchId: 1, status: 1 });

export default mongoose.models.Student || mongoose.model("Student", StudentSchema);
