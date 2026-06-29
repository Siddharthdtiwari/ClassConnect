const Batch = require("../../models/Batch");
const Syllabus = require("../../models/Syllabus");
const { sortBatches } = require("../../utils/sortHelpers");

exports.renderTracker = async (req, res) => {
  try {
    const batches = await Batch.find({ academicYear: req.viewingYear, isActive: true }).lean();
    batches.sort(sortBatches);

    // If a specific batch is requested, render it, else show the first one
    let selectedBatchId = req.query.batchId || (batches.length > 0 ? batches[0]._id.toString() : null);
    let selectedBatchName = "";
    
    if (selectedBatchId) {
      const match = batches.find(b => b._id.toString() === selectedBatchId);
      if (match) selectedBatchName = match.name;
    }

    // Fetch all syllabus records for this batch
    let syllabusRecords = [];
    if (selectedBatchId) {
      syllabusRecords = await Syllabus.find({ batch: selectedBatchId }).lean();
    }

    // Convert into a map of Subject -> Data for easy rendering
    const syllabusMap = {};
    syllabusRecords.forEach(record => {
      syllabusMap[record.subject] = {
        chapterStatuses: record.chapterStatuses || {},
        totalChapters: record.totalChapters || 10
      };
    });

    res.render("teacher/syllabus_tracker", {
      batches,
      selectedBatchId,
      selectedBatchName,
      syllabusMap,
    });
  } catch (err) {
    console.error("Error rendering syllabus tracker:", err);
    res.status(500).send("Error loading syllabus tracker.");
  }
};

exports.updateChapterCount = async (req, res) => {
  try {
    const { batchId, subject, action } = req.body;
    
    if (!batchId || !subject || !action) {
      return res.status(400).json({ success: false, message: "Missing required fields." });
    }

    let record = await Syllabus.findOne({ batch: batchId, subject: subject });
    if (!record) {
      record = new Syllabus({
        batch: batchId,
        subject: subject,
        chapterStatuses: {},
        totalChapters: 10
      });
    }

    if (action === 'add') {
      record.totalChapters += 1;
    } else if (action === 'remove' && record.totalChapters > 1) {
      // Optionally remove the status for the deleted chapter
      if (record.chapterStatuses && record.chapterStatuses.has(record.totalChapters.toString())) {
        record.chapterStatuses.delete(record.totalChapters.toString());
      }
      record.totalChapters -= 1;
    }

    await record.save();
    res.json({ success: true, totalChapters: record.totalChapters });
  } catch (err) {
    console.error("Error updating chapter count:", err);
    res.status(500).json({ success: false, message: "Server error." });
  }
};

exports.updateChapterStatus = async (req, res) => {
  try {
    const { batchId, subject, chapterNo, status } = req.body;

    if (!batchId || !subject || !chapterNo || !status) {
      return res.status(400).json({ success: false, message: "Missing required fields." });
    }

    // Find or create syllabus record for this batch & subject
    let record = await Syllabus.findOne({ batch: batchId, subject: subject });
    
    if (!record) {
      record = new Syllabus({
        batch: batchId,
        subject: subject,
        chapterStatuses: {}
      });
    }

    // The type of chapterStatuses is Map, so we use .set()
    if (!record.chapterStatuses) {
      record.chapterStatuses = new Map();
    }
    
    record.chapterStatuses.set(chapterNo.toString(), status);
    
    await record.save();

    res.json({ success: true, message: "Status updated." });
  } catch (err) {
    console.error("Error updating chapter status:", err);
    res.status(500).json({ success: false, message: "Server error." });
  }
};
