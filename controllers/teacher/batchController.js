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

exports.renderAddBatch = (req, res) => {
  res.render("teacher/add_batch");
};

exports.processAddBatch = async (req, res) => {
  try {
    const { name, description } = req.body;
    const academicYear = req.viewingYear;

    if (!name || name.trim() === "") {
      return res.render("teacher/add_batch", { error: "Batch name is required." });
    }

    const existing = await Batch.findOne({ name: name.trim(), academicYear });
    if (existing) {
      return res.render("teacher/add_batch", { error: `Batch "${name}" already exists for academic year ${academicYear}.` });
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
    res.render("teacher/add_batch", { error: "Failed to add batch. Please try again." });
  }
};

exports.renderEditBatch = async (req, res) => {
  try {
    const batch = await Batch.findById(req.params.id).lean();
    if (!batch) {
      return res.status(404).send("Batch not found");
    }
    res.render("teacher/edit_batch", { batch });
  } catch (err) {
    console.error("Edit batch GET error:", err);
    res.status(500).send("Error loading batch");
  }
};

exports.processEditBatch = async (req, res) => {
  try {
    const { name, description, isActive } = req.body;
    const batch = await Batch.findById(req.params.id);
    if (!batch) {
      return res.status(404).send("Batch not found");
    }

    if (!name || name.trim() === "") {
      return res.render("teacher/edit_batch", { batch, error: "Batch name is required." });
    }

    // Check duplicate (if name changed)
    if (name.trim() !== batch.name) {
      const existing = await Batch.findOne({ name: name.trim(), academicYear: batch.academicYear });
      if (existing) {
        return res.render("teacher/edit_batch", { batch, error: `Another batch named "${name}" already exists.` });
      }
    }

    batch.name = name.trim();
    batch.description = description ? description.trim() : "";
    batch.isActive = isActive === "true" || isActive === true;

    await batch.save();
    res.redirect("/teacher/manage_batches");
  } catch (err) {
    console.error("Edit batch POST error:", err);
    res.render("teacher/edit_batch", { batch, error: "Failed to update batch. Please try again." });
  }
};
