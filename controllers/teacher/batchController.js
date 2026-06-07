const Batch = require("../../models/Batch");
const User = require("../../models/User");
const { sortBatches } = require("../../utils/sortHelpers");

exports.renderManageBatches = async (req, res) => {
  try {
    const batches = await Batch.find({ academicYear: req.viewingYear }).lean();
    batches.sort(sortBatches);
    
    // Calculate dynamic student count for each batch
    const batchesWithCounts = await Promise.all(
      batches.map(async (batch) => {
        const studentCount = await User.countDocuments({ batch: batch._id });
        return { ...batch, studentCount };
      })
    );

    res.render("teacher/manage_batches", { batches: batchesWithCounts });
  } catch (err) {
    console.error("Manage batches error:", err);
    res.status(500).send("Error loading batches");
  }
};

exports.processAddBatch = async (req, res) => {
  try {
    const { name, description } = req.body;
    const academicYear = req.viewingYear;

    if (!name || name.trim() === "") {
      return res.redirect("/teacher/manage_batches");
    }

    const existing = await Batch.findOne({ name: name.trim(), academicYear });
    if (existing) {
      return res.redirect("/teacher/manage_batches");
    }

    const newBatch = new Batch({
      name: name.trim(),
      academicYear,
      description: description ? description.trim() : "",
      isActive: true,
    });

    await newBatch.save();
    res.redirect("/teacher/manage_batches");
  } catch (err) {
    console.error("Add batch error:", err);
    res.redirect("/teacher/manage_batches");
  }
};

exports.processEditBatch = async (req, res) => {
  try {
    const { name, description, isActive } = req.body;
    const batch = await Batch.findById(req.params.id);
    if (!batch) {
      return res.redirect("/teacher/manage_batches");
    }

    if (!name || name.trim() === "") {
      return res.redirect("/teacher/manage_batches");
    }

    // Check duplicate (if name changed)
    if (name.trim() !== batch.name) {
      const existing = await Batch.findOne({ name: name.trim(), academicYear: batch.academicYear });
      if (existing) {
        return res.redirect("/teacher/manage_batches");
      }
    }

    batch.name = name.trim();
    batch.description = description ? description.trim() : "";
    batch.isActive = isActive === "true" || isActive === true;

    await batch.save();
    res.redirect("/teacher/manage_batches");
  } catch (err) {
    console.error("Edit batch POST error:", err);
    res.redirect("/teacher/manage_batches");
  }
};
