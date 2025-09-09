const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    standard: { type: String, required: true },
    studentId: { type: String, required: true, unique: true },
    studentName: { type: String, required: true },
    password: { type: String, required: true },
    mobileNo: { type: String, required: true },
    monthlyFee: { type: Number, required: true },
    profilePhoto: { type: String },
    points: { type: Number, default: 0 }
});

module.exports = mongoose.model("User", userSchema);
