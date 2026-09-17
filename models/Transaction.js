const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: ["INCOME", "EXPENSE"],
    },
    category: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 250,
    },
    referenceId: {
      type: String, // Optional reference to teacher, receipt, etc.
      trim: true,
    },
    teacherRef: {
      // Exact reference for salary transactions — matching staff by substring-searching
      // `description` is ambiguous whenever one teacher's name is a substring of another's
      // (e.g. "Priya" vs "Priyanka"), so every salary-category write must set this.
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher", // Assuming admins log in via Teacher model
    },
    academicYear: {
      type: String,
      required: true,
    }
  },
  { timestamps: true }
);

transactionSchema.index({ type: 1, academicYear: 1 });
transactionSchema.index({ date: -1 });

module.exports = mongoose.model("Transaction", transactionSchema);
