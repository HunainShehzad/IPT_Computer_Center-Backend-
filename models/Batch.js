import mongoose from 'mongoose';

const BatchSchema = new mongoose.Schema({
  name: { type: String, required: true },
  timing: { type: String, required: true },
  status: { type: String, enum: ['active', 'completed'], default: 'active' }
}, { timestamps: true });

export default mongoose.models.Batch || mongoose.model('Batch', BatchSchema);
