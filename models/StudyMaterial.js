const mongoose = require("mongoose");

const studyMaterialSchema = new mongoose.Schema({
  standard: { type: String, required: true },
  subject: { type: String, required: true },
  materialType: { type: String, required: true },
  description: { type: String },
  filePath: { type: String },
  uploadedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("StudyMaterial", studyMaterialSchema);