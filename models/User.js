const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Batch',
      required: true,
    },
    studentId: { type: String, required: true },
    studentName: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },
    mobileNo: { type: String, required: true, trim: true },
    profilePhoto: { type: String },
    points: { type: Number, default: 0, min: 0 },
    monthlyFee: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.index({ studentId: 1, batch: 1 }, { unique: true });
userSchema.index({ batch: 1 });
userSchema.index({ createdAt: -1 });

userSchema.statics.recalculatePoints = async function(batchId) {
  const Score = mongoose.model("Score");
  const scores = await Score.find({ batch: batchId });
  const pointsMap = {};
  scores.forEach(s => {
    pointsMap[s.studentId] = (pointsMap[s.studentId] || 0) + Math.round(s.percentage || 0);
  });
  
  const users = await this.find({ batch: batchId });
  const ops = users.map(u => ({
    updateOne: {
      filter: { _id: u._id },
      update: { $set: { points: pointsMap[u.studentId] || 0 } }
    }
  }));
  if (ops.length > 0) {
    await this.bulkWrite(ops);
  }
};

module.exports = mongoose.model("User", userSchema);
