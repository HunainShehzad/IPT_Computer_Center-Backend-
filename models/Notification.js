import mongoose from "mongoose";

const NotificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Notification title is required."],
      trim: true,
      maxlength: [200, "Title must be 200 characters or fewer."],
    },
    message: {
      type: String,
      required: [true, "Notification message is required."],
      trim: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    audience: {
      type: String,
      enum: ["all", "selected"],
      default: "all",
    },
    recipients: [{ type: String }],
    createdBy:     { type: String, required: true },
    createdByName: { type: String, default: "Admin" },
    isActive:      { type: Boolean, default: true },
    expiryDate:    { type: Date, default: null },
  },
  { timestamps: true }
);

// Indexes for fast queries
NotificationSchema.index({ isActive: 1, audience: 1, createdAt: -1 });
NotificationSchema.index({ recipients: 1, createdAt: -1 });
NotificationSchema.index({ priority: 1, createdAt: -1 });

export default mongoose.models.Notification ||
  mongoose.model("Notification", NotificationSchema);
