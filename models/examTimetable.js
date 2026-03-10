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
        standard: { type: String, required: true },
        examType: { type: String, required: true, enum: EXAM_TYPES },
        subject: { type: String, required: true, trim: true },
        examDate: { type: Date, required: true },
        chapters: { type: String, required: true, trim: true },
        addedBy: { type: String, enum: ["student", "teacher"], required: true },
        addedById: { type: String, required: true },
        addedByName: { type: String, required: true },
    },
    { timestamps: true }
);

module.exports = mongoose.model("ExamTimetable", examTimetableSchema);
