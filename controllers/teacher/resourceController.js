const StudyMaterial = require("../../models/StudyMaterial");
const Batch = require("../../models/Batch");
const { uploadToCloudinary } = require("../../utils/upload");
const { sortBatches } = require("../../utils/sortHelpers");
const mongoose = require("mongoose");
const { logAudit } = require("../../utils/auditService");

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
    await logAudit({
      action: "CREATE",
      entityType: "StudyMaterial",
      entityId: material._id,
      details: `Uploaded new study material for ${subject}`,
      academicYear: req.viewingYear
    });
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
    await logAudit({
      action: "UPDATE",
      entityType: "StudyMaterial",
      entityId: material._id,
      details: `Updated study material for ${subject}`,
      academicYear: req.viewingYear
    });
    res.json({ success: true, message: "Study material updated successfully!" });
  } catch (err) {
    console.error("Study material update API error:", err);
    res.status(500).json({ success: false, message: "Failed to update study material." });
  }
};

exports.processStudyMaterialDelete = async (req, res) => {
  try {
    await StudyMaterial.findByIdAndDelete(req.params.id);
    await logAudit({
      action: "DELETE",
      entityType: "StudyMaterial",
      details: `Deleted study material`,
      academicYear: req.viewingYear
    });
    res.json({ success: true, message: "Study material deleted successfully!" });
  } catch (err) {
    console.error("Study material delete API error:", err);
    res.status(500).json({ success: false, message: "Failed to delete study material." });
  }
};

exports.repostSingleMaterial = async (req, res) => {
  try {
    const { id } = req.params;
    const currentYear = req.currentAcademicYear;

    const sourceMaterial = await StudyMaterial.findById(id).populate('batch');
    if (!sourceMaterial) {
      return res.status(404).json({ success: false, message: "Resource not found." });
    }

    if (!sourceMaterial.batch) {
      return res.status(400).json({ success: false, message: "Source batch not found." });
    }

    const batchName = sourceMaterial.batch.name;

    // Find the corresponding batch in the current active academic year
    const targetBatch = await Batch.findOne({
      name: { $regex: new RegExp(`^${batchName.trim()}$`, "i") },
      academicYear: currentYear
    });

    if (!targetBatch) {
      return res.status(400).json({
        success: false,
        message: `No matching batch named "${batchName}" found in the current year ${currentYear}. Please create this batch in the current year first.`
      });
    }

    // Check if duplicate already exists
    const duplicate = await StudyMaterial.findOne({
      batch: targetBatch._id,
      subject: sourceMaterial.subject,
      materialType: sourceMaterial.materialType,
      filePath: sourceMaterial.filePath
    });

    if (duplicate) {
      return res.status(400).json({ success: false, message: `This material has already been reposted to the current year (${currentYear}).` });
    }

    await StudyMaterial.create({
      batch: targetBatch._id,
      subject: sourceMaterial.subject,
      materialType: sourceMaterial.materialType,
      description: sourceMaterial.description,
      filePath: sourceMaterial.filePath
    });

    await logAudit({
      action: "REPOST",
      entityType: "StudyMaterial",
      details: `Reposted "${sourceMaterial.subject}" from previous year to ${currentYear} (${batchName})`,
      academicYear: currentYear
    });

    res.json({ success: true, message: `Successfully reposted "${sourceMaterial.subject}" to ${currentYear} (${batchName})!` });
  } catch (err) {
    console.error("Repost single material error:", err);
    res.status(500).json({ success: false, message: "Failed to repost material." });
  }
};

exports.repostMultipleMaterials = async (req, res) => {
  try {
    const { ids } = req.body;
    const currentYear = req.currentAcademicYear;

    if (!ids || !ids.length) {
      return res.status(400).json({ success: false, message: "No material IDs provided." });
    }

    const sourceMaterials = await StudyMaterial.find({ _id: { $in: ids } }).populate('batch').lean();
    
    // Find all batches in current year
    const currentBatches = await Batch.find({ academicYear: currentYear }).lean();
    const batchMap = {};
    currentBatches.forEach(b => {
      batchMap[b.name.toLowerCase().trim()] = b._id;
    });

    let clonedCount = 0;
    let skippedCount = 0;

    for (const mat of sourceMaterials) {
      const name = mat.batch ? mat.batch.name.toLowerCase().trim() : null;
      if (!name || !batchMap[name]) {
        skippedCount++;
        continue;
      }

      const duplicate = await StudyMaterial.findOne({
        batch: batchMap[name],
        subject: mat.subject,
        materialType: mat.materialType,
        filePath: mat.filePath
      });

      if (duplicate) {
        skippedCount++;
        continue;
      }

      await StudyMaterial.create({
        batch: batchMap[name],
        subject: mat.subject,
        materialType: mat.materialType,
        description: mat.description,
        filePath: mat.filePath
      });
      clonedCount++;
    }

    await logAudit({
      action: "REPOST",
      entityType: "StudyMaterial",
      details: `Bulk reposted ${clonedCount} material(s) to ${currentYear}`,
      academicYear: currentYear
    });

    res.json({
      success: true,
      message: `Successfully reposted ${clonedCount} material(s) to ${currentYear}!${skippedCount ? ` (${skippedCount} skipped due to missing batches or duplicates)` : ''}`
    });
  } catch (err) {
    console.error("Repost multiple materials error:", err);
    res.status(500).json({ success: false, message: "Failed to repost materials." });
  }
};
