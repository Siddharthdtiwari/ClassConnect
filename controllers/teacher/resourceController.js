const StudyMaterial = require("../../models/StudyMaterial");
const Batch = require("../../models/Batch");
const { uploadToCloudinary } = require("../../utils/upload");
const { sortBatches } = require("../../utils/sortHelpers");

exports.renderStudyMaterial = async (req, res) => {
  try {
    const batches = await Batch.find({ academicYear: req.viewingYear });
    batches.sort(sortBatches);
    const batchIds = batches.map(b => b._id);
    const materials = await StudyMaterial.find({ batch: { $in: batchIds } }).populate('batch').lean();
    
    materials.forEach(m => {
      m.standard = m.batch ? m.batch.name : 'Unknown';
    });

    res.render("teacher/study_material", { batches, materials });
  } catch (err) {
    console.error("Study material GET error:", err);
    res.status(500).send("Error loading study materials");
  }
};

exports.processStudyMaterialUpload = async (req, res) => {
  try {
    const { batchId, subject, materialType, description, link } = req.body;
    if (!batchId || !subject || !materialType) {
      return res.status(400).json({ success: false, message: "Missing required fields." });
    }

    let filePath = "";
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, "study-materials");
      filePath = result.secure_url;
    } else if (link && link.trim() !== "") {
      filePath = link.trim();
    }

    const material = new StudyMaterial({
      batch: batchId,
      subject,
      materialType,
      description,
      filePath
    });

    await material.save();
    res.json({ success: true, message: "Study material published successfully!" });
  } catch (err) {
    console.error("Study material add error:", err);
    res.status(500).json({ success: false, message: "Failed to publish study material." });
  }
};

exports.processStudyMaterialUpdate = async (req, res) => {
  try {
    const { batchId, subject, materialType, description, link } = req.body;
    const material = await StudyMaterial.findById(req.params.id);
    if (!material) {
      return res.status(404).json({ success: false, message: "Resource not found." });
    }

    if (batchId) material.batch = batchId;
    if (subject) material.subject = subject;
    if (materialType) material.materialType = materialType;
    if (description !== undefined) material.description = description;

    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, "study-materials");
      material.filePath = result.secure_url;
    } else if (link && link.trim() !== "") {
      material.filePath = link.trim();
    }

    await material.save();
    res.json({ success: true, message: "Study material updated successfully!" });
  } catch (err) {
    console.error("Study material update API error:", err);
    res.status(500).json({ success: false, message: "Failed to update study material." });
  }
};

exports.processStudyMaterialDelete = async (req, res) => {
  try {
    await StudyMaterial.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Study material deleted successfully!" });
  } catch (err) {
    console.error("Study material delete API error:", err);
    res.status(500).json({ success: false, message: "Failed to delete study material." });
  }
};
