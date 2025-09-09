
const mongoose = require("mongoose");

const teacherSchema = new mongoose.Schema({
    teacherId: { type: String, required: true, unique: true },
    teacherName: { type: String, required: true },
    email: { type: String, required: true },
    subjects: { type: String, required: true },
    password: { type: String, required: true }
});


module.exports = mongoose.model("Teacher", teacherSchema);
