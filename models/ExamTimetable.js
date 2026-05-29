const mongoose = require("mongoose");

const EXAM_TYPES = [
  "Unit Test 1",
  "Unit Test 2",
  "Semester 1",
  "Semester 2",
  "Class Test",
];

const examTimetableSchema = new mongoose.Schema(
  {
    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Batch",
      required: true,
    },
    examType: { type: String, required: true, enum: EXAM_TYPES },
    subject: { type: String, required: true, trim: true },
    examDate: {
      type: Date,
      required: true,
    },
    chapters: { type: String, required: true, trim: true, minlength: 1 },
    addedBy: { type: String, enum: ["student", "teacher"], required: true },
    addedById: { type: String, required: true, trim: true },
    addedByName: { type: String, required: true, trim: true },
    addedByBatch: { type: mongoose.Schema.Types.ObjectId, ref: "Batch" },
  },
  { timestamps: true }
);

examTimetableSchema.index({ batch: 1 });
examTimetableSchema.index({ examDate: 1 });

module.exports = mongoose.model("ExamTimetable", examTimetableSchema);
