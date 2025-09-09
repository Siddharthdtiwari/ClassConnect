const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema({
    date: { type: String, required: true }, // format: YYYY-MM-DD
    records: [
        {
            studentId: { type: String, required: true },
            status: { type: String, enum: ["P", "A", "H"], required: true } // Present / Absent / Holiday
        }
    ],
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Attendance", attendanceSchema);
