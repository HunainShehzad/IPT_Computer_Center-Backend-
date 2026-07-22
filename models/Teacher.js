import mongoose from "mongoose";

const TeacherSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },
    department: {
      type: String,
      enum: ["Computer Department", "Language Department"],
      required: true,
    },
    assignedBatches: [{ type: mongoose.Schema.Types.ObjectId, ref: "Batch" }],
    username: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true },
    plainPassword: { type: String },
    role: { type: String, default: "teacher" },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    profilePicture: { type: String, default: null },
    // Fixed monthly salary stored on the teacher record.
    // Used as the default value when creating a salary record for any month.
    monthlySalary: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

export default mongoose.models.Teacher || mongoose.model("Teacher", TeacherSchema);
