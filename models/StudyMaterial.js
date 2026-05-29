const mongoose = require("mongoose");

const studyMaterialSchema = new mongoose.Schema(
  {
    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Batch",
      required: true,
    },
    subject: { type: String, required: true, trim: true },
    materialType: {
      type: String,
      required: true,
      enum: ["PDF", "Video", "Document", "Link", "Image", "textbook", "questionPaper", "notes"],
    },
    description: { type: String, trim: true },
    filePath: { type: String },
    url: { type: String, trim: true },
  },
  { timestamps: true }
);

studyMaterialSchema.index({ batch: 1 });
studyMaterialSchema.index({ createdAt: -1 });

module.exports = mongoose.model("StudyMaterial", studyMaterialSchema);
