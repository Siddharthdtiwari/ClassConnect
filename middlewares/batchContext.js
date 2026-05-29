const mongoose = require("mongoose");
const Batch = require("../models/Batch");

exports.loadBatches = async (req, res, next) => {
  try {
    if (req.viewingYear) {
      const b = await Batch.find({ academicYear: req.viewingYear }).select('_id').lean();
      req.viewingBatches = b.map(x => x._id);
    }
    if (req.currentAcademicYear) {
      const b = await Batch.find({ academicYear: req.currentAcademicYear }).select('_id').lean();
      req.currentBatches = b.map(x => x._id);
    }
    next();
  } catch (err) {
    console.error("Error loading batches for context:", err);
    next();
  }
};
