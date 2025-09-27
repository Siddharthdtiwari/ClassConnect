const mongoose = require("mongoose");

const scoreSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true },
    studentName: { type: String, required: true },
    standard: { type: String, required: true },
    testId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Test",
      required: true,
    },
    testName: { type: String, required: true },
    score: { type: Number, required: true },
    percentage: { type: Number, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Score", scoreSchema);
