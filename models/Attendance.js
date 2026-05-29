const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
  {
    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Batch",
      required: true,
    },
    date: { type: Date, required: true, index: true },
    records: [
      {
        studentId: { type: String, required: true },
        userRef: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        status: { type: String, enum: ["P", "A", "H"], required: true },
      },
    ],
  },
  { timestamps: true }
);

attendanceSchema.index({ batch: 1, date: 1 }, { unique: true });
attendanceSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Attendance", attendanceSchema);
