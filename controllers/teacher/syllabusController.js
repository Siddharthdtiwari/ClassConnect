const Batch = require("../../models/Batch");
const Syllabus = require("../../models/Syllabus");
const User = require("../../models/User");
const StudentSyllabusProgress = require("../../models/StudentSyllabusProgress");
const { sortBatches, sortStudentsByBatchAndId } = require("../../utils/sortHelpers");
const { renderError } = require("../../utils/renderError");
const { logAudit } = require("../../utils/auditService");

exports.renderTracker = async (req, res) => {
  try {
    const batches = await Batch.find({ academicYear: req.viewingYear, isActive: true }).lean();
    batches.sort(sortBatches);

    let selectedBatchId = req.query.batchId || "all";
    let selectedBatchName = "All Batches";
    
    if (selectedBatchId !== "all") {
      const match = batches.find(b => b._id.toString() === selectedBatchId);
      if (match) {
        selectedBatchName = match.name;
      } else {
        selectedBatchId = "all";
      }
    }

    // Fetch all syllabus records for the selected batch(es)
    let syllabusRecords = [];
    if (selectedBatchId === "all") {
      const activeBatchIds = batches.map(b => b._id);
      syllabusRecords = await Syllabus.find({ batch: { $in: activeBatchIds } }).lean();
    } else {
      syllabusRecords = await Syllabus.find({ batch: selectedBatchId }).lean();
    }

    // Convert into a nested map: batchId -> subject -> Data
    const syllabusMap = {};
    syllabusRecords.forEach(record => {
      const bId = record.batch.toString();
      if (!syllabusMap[bId]) syllabusMap[bId] = {};
      syllabusMap[bId][record.subject] = {
        chapterStatuses: record.chapterStatuses || {},
        totalChapters: record.totalChapters || 10
      };
    });

    // Per-student breakdown: who's actually revised what, not just what the
    // teacher has taught. Scoped to the same batch(es) already selected above.
    const relevantBatchIds = selectedBatchId === "all" ? batches.map(b => b._id) : [selectedBatchId];
    const [students, progressRecords] = await Promise.all([
      User.find({ batch: { $in: relevantBatchIds } }).select("studentId studentName batch").lean(),
      StudentSyllabusProgress.find({ batch: { $in: relevantBatchIds } }).lean(),
    ]);
    students.sort(sortStudentsByBatchAndId);

    // progressByBatchStudentSubject[batchId][studentId][subject] = chapterStatuses
    const progressLookup = {};
    progressRecords.forEach(p => {
      const bId = p.batch.toString();
      if (!progressLookup[bId]) progressLookup[bId] = {};
      if (!progressLookup[bId][p.studentId]) progressLookup[bId][p.studentId] = {};
      progressLookup[bId][p.studentId][p.subject] = p.chapterStatuses || {};
    });

    // studentProgressMap[batchId][subject] = [{ studentId, studentName, completed, total }]
    const studentProgressMap = {};
    students.forEach(student => {
      const bId = student.batch.toString();
      const subjectsForBatch = syllabusMap[bId] || {};
      Object.keys(subjectsForBatch).forEach(subject => {
        const totalChapters = subjectsForBatch[subject].totalChapters;
        const statuses = (progressLookup[bId] && progressLookup[bId][student.studentId] && progressLookup[bId][student.studentId][subject]) || {};
        let completed = 0;
        for (let i = 1; i <= totalChapters; i++) {
          if (statuses[i.toString()] === "completed") completed++;
        }

        if (!studentProgressMap[bId]) studentProgressMap[bId] = {};
        if (!studentProgressMap[bId][subject]) studentProgressMap[bId][subject] = [];
        studentProgressMap[bId][subject].push({
          studentId: student.studentId,
          studentName: student.studentName,
          completed,
          total: totalChapters,
          chapterStatuses: statuses,
        });
      });
    });

    res.render("teacher/syllabus_tracker", {
      batches,
      selectedBatchId,
      selectedBatchName,
      syllabusMap,
      studentProgressMap,
    });
  } catch (err) {
    console.error("Error rendering syllabus tracker:", err);
    renderError(req, res, 500, "Error loading syllabus tracker.");
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

    await logAudit(req, {
      action: "UPDATE",
      entityType: "Syllabus",
      entityId: record._id,
      details: `${action === 'add' ? 'Added' : 'Removed'} a chapter for ${subject} (now ${record.totalChapters})`,
      academicYear: req.viewingYear || "N/A"
    });

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

    await logAudit(req, {
      action: "UPDATE",
      entityType: "Syllabus",
      entityId: record._id,
      details: `Marked ${subject} chapter ${chapterNo} as ${status}`,
      academicYear: req.viewingYear || "N/A"
    });

    res.json({ success: true, message: "Status updated." });
  } catch (err) {
    console.error("Error updating chapter status:", err);
    res.status(500).json({ success: false, message: "Server error." });
  }
};
