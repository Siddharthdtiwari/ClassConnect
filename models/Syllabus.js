const mongoose = require("mongoose");

const syllabusSchema = new mongoose.Schema(
  {
    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Batch',
      required: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    totalChapters: {
      type: Number,
      default: 10,
    },
    // We will store chapter completion statuses here.
    // e.g. { "1": "completed", "2": "na", "3": "incomplete" }
    chapterStatuses: {
      type: Map,
      of: String,
      default: {},
    }
  },
  { timestamps: true }
);

// Ensure a batch can only have one syllabus record per subject
syllabusSchema.index({ batch: 1, subject: 1 }, { unique: true });

module.exports = mongoose.model("Syllabus", syllabusSchema);
