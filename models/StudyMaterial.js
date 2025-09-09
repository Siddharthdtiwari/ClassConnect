const mongoose = require('mongoose');

const studyMaterialSchema = new mongoose.Schema({
    standard: { type: String, required: true },
    subject: { type: String, required: true },
    materialType: { type: String, required: true }, // textbook, question-paper, study-material
    description: { type: String },
    filePath: { type: String }, // path to uploaded file
    uploadedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('StudyMaterial', studyMaterialSchema);
