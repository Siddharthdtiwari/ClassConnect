const mongoose = require("mongoose");

const testSchema = new mongoose.Schema(
  {
    testName: { type: String, required: true, trim: true },
    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Batch",
      required: true,
    },
    subject: { type: String, required: true, trim: true },
    topic: { type: String, required: true, trim: true },
    totalMarks: { type: Number, required: true, min: 1 },
    testDate: { type: Date, required: true },
    questionPaper: { type: String, required: false },
    htmlContent: { type: String, default: "" },
  },
  { timestamps: true }
);

testSchema.index({ batch: 1 });
testSchema.index({ testDate: -1 });
testSchema.index({ createdAt: -1 });

testSchema.pre("save", function (next) {
  this._totalMarksChanged = this.isModified("totalMarks");
  next();
});

const { calculatePercentage } = require("../utils/constants");

testSchema.post("save", async function () {
  try {
    if (!this._totalMarksChanged) return;

    const Score = mongoose.model("Score");
    const scores = await Score.find({ testId: this._id });

    if (scores.length === 0) return;

    // Use bulkWrite for efficient batch updates
    const operations = scores.map((s) => ({
      updateOne: {
        filter: { _id: s._id },
        update: {
          $set: {
            percentage: calculatePercentage(s.score, this.totalMarks),
          },
        },
      },
    }));

    await Score.bulkWrite(operations);
  } catch (err) {
    console.error("Error recalculating scores after test update:", err);
  }
});

module.exports = mongoose.model("Test", testSchema);
