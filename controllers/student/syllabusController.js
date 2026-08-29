const User = require("../../models/User");
const Syllabus = require("../../models/Syllabus");
const StudentSyllabusProgress = require("../../models/StudentSyllabusProgress");
const { renderError } = require("../../utils/renderError");

exports.renderTracker = async (req, res) => {
  try {
    const student = await User.findById(req.session.userId).populate('batch').lean();
    if (!student || !student.batch) {
      return res.render("student/syllabus", { batchName: null, syllabusMap: {} });
    }

    // Chapter count comes from the teacher's tracker; completion status is this
    // student's own — the two are fetched separately and merged, never conflated.
    const [syllabusRecords, progressRecords] = await Promise.all([
      Syllabus.find({ batch: student.batch._id }).lean(),
      StudentSyllabusProgress.find({ userRef: student._id, batch: student.batch._id }).lean(),
    ]);

    const progressBySubject = {};
    progressRecords.forEach(record => {
      progressBySubject[record.subject] = record.chapterStatuses || {};
    });

    const syllabusMap = {};
    syllabusRecords.forEach(record => {
      syllabusMap[record.subject] = {
        totalChapters: record.totalChapters || 10,
        teacherStatuses: record.chapterStatuses || {},   // taught in class — read-only here
        studentStatuses: progressBySubject[record.subject] || {}, // this student's own revision progress
      };
    });

    res.render("student/syllabus", {
      batchName: student.batch.name,
      syllabusMap,
    });
  } catch (err) {
    console.error("Error rendering student syllabus tracker:", err);
    renderError(req, res, 500, "Error loading syllabus tracker.");
  }
};

exports.updateChapterStatus = async (req, res) => {
  try {
    const { subject, chapterNo, status } = req.body;
    if (!subject || !chapterNo || !status) {
      return res.status(400).json({ success: false, message: "Missing required fields." });
    }

    const student = await User.findById(req.session.userId).lean();
    if (!student || !student.batch) {
      return res.status(400).json({ success: false, message: "No batch assigned." });
    }

    // Chapter count is only ever decided by the teacher's tracker — refuse to record
    // progress against a chapter number the teacher hasn't defined for this subject.
    const syllabus = await Syllabus.findOne({ batch: student.batch, subject }).lean();
    // A subject the teacher hasn't touched yet has no Syllabus doc at all — the view
    // still renders it with the same 10-chapter default the teacher's own tracker
    // uses, so this has to match that fallback rather than treating "no doc" as 0
    // chapters and rejecting every click on a freshly-added subject.
    const totalChapters = syllabus ? (syllabus.totalChapters || 10) : 10;
    if (Number(chapterNo) < 1 || Number(chapterNo) > totalChapters) {
      return res.status(400).json({ success: false, message: "Invalid chapter for this subject." });
    }

    let record = await StudentSyllabusProgress.findOne({ userRef: student._id, batch: student.batch, subject });
    if (!record) {
      record = new StudentSyllabusProgress({
        userRef: student._id,
        studentId: student.studentId,
        batch: student.batch,
        subject,
        chapterStatuses: {},
      });
    }
    if (!record.chapterStatuses) record.chapterStatuses = new Map();
    record.chapterStatuses.set(chapterNo.toString(), status);
    await record.save();

    res.json({ success: true, message: "Progress updated." });
  } catch (err) {
    console.error("Error updating student syllabus progress:", err);
    res.status(500).json({ success: false, message: "Server error." });
  }
};
