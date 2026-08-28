import mongoose from "mongoose";

/**
 * Settings model — stores global application settings as key/value documents.
 * Currently used for:
 *   - principalSignature: base64 data URI or URL of the principal's signature image
 */
const SettingsSchema = new mongoose.Schema(
  {
    key:   { type: String, required: true, unique: true, trim: true },
    value: { type: String, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.Settings || mongoose.model("Settings", SettingsSchema);
