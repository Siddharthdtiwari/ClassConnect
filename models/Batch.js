const mongoose = require("mongoose");

const batchSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    academicYear: {
      type: String,
      required: true,
      index: true,
      match: [/^\d{4}-\d{2}$/, "academicYear must be in format YYYY-YY (e.g. 2025-26)"],
    },
    description: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    }
  },
  { timestamps: true }
);

batchSchema.index({ name: 1, academicYear: 1 }, { unique: true });

module.exports = mongoose.model("Batch", batchSchema);