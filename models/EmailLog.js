const mongoose = require("mongoose");

const emailLogSchema = new mongoose.Schema(
  {
    to: {
      type: String,
      required: true,
      trim: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    emailType: {
      type: String,
      enum: ["Fee Receipt", "Test Score", "Attendance Report", "General", "Contact Confirmation"],
      default: "General",
    },
    status: {
      type: String,
      enum: ["Sent", "Failed"],
      default: "Sent",
    },
    errorMessage: {
      type: String,
    },
    studentRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    academicYear: {
      type: String,
    }
  },
  { timestamps: true }
);

emailLogSchema.index({ academicYear: 1 });
emailLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("EmailLog", emailLogSchema);
