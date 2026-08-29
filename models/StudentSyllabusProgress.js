const mongoose = require("mongoose");

// A student's own revision checklist for a subject — independent of the teacher's
// Syllabus record (which tracks what's been TAUGHT in class, not what a given
// student has personally revised). Chapter count is never stored here; it's always
// read from the teacher's Syllabus.totalChapters for the same (batch, subject).
const studentSyllabusProgressSchema = new mongoose.Schema(
  {
    userRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    studentId: {
      type: String,
      required: true,
      trim: true,
    },
    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Batch",
      required: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    // e.g. { "1": "completed", "2": "incomplete" } — same two-state vocabulary as
    // the teacher's tracker, but this student's own progress, not the class's.
    chapterStatuses: {
      type: Map,
      of: String,
      default: {},
    },
  },
  { timestamps: true }
);

// One progress record per student per subject per batch.
studentSyllabusProgressSchema.index({ userRef: 1, batch: 1, subject: 1 }, { unique: true });

module.exports = mongoose.model("StudentSyllabusProgress", studentSyllabusProgressSchema);
