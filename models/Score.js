const mongoose = require("mongoose");

const scoreSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true },
    studentName: { type: String, required: true },
    userRef: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Batch",
      required: true,
    },
    testId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Test",
      required: true,
    },
    testName: { type: String, required: true },
    score: { type: Number, required: true, min: 0 },
    percentage: { type: Number, required: true, min: 0, max: 100 },
  },
  { timestamps: true }
);

scoreSchema.pre("save", async function (next) {
  try {
    const Test = mongoose.model("Test");
    const test = await Test.findById(this.testId);

    if (test && test.totalMarks > 0) {
      this.percentage = Math.round((this.score / test.totalMarks) * 10000) / 100;
    }
    next();
  } catch (err) {
    next(err);
  }
});

scoreSchema.index({ studentId: 1, batch: 1 });
scoreSchema.index({ testId: 1, batch: 1 });
scoreSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Score", scoreSchema);
