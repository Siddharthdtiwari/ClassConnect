const mongoose = require("mongoose");
const testSchema = new mongoose.Schema({
  testName: String,
  standard: String,
  subject: String,
  topic: String,
  totalMarks: Number,
  questionPaper: String,
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Test", testSchema);