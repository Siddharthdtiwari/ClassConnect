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

module.exports = mongoose.model("User", userSchema);
