import mongoose from "mongoose";

const FeeSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
  batchId:   { type: mongoose.Schema.Types.ObjectId, ref: "Batch",   required: true },
  month:  { type: String, required: true }, // e.g., "May 2026"
  status: { type: String, enum: ["Paid", "Unpaid"], default: "Unpaid" },

  // Stamped when a fee record transitions to "Paid".
  // Used for accurate Today / This Week / This Month revenue calculations.
  // Null means the fee has never been paid (or was paid before this field existed).
  paidAt: { type: Date, default: null },
});

// ── Indexes ──────────────────────────────────────────────────────────────────
// fetchFees(batchId) — all fee records for a batch
FeeSchema.index({ batchId: 1 });

// upsertFee — findOneAndUpdate({ studentId, batchId, month }) needs all three
FeeSchema.index({ studentId: 1, batchId: 1, month: 1 }, { unique: true });

// analytics queries that filter by status + paidAt
FeeSchema.index({ status: 1, paidAt: 1 });

export default mongoose.models.Fee || mongoose.model("Fee", FeeSchema);
