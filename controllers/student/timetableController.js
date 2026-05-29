const User = require("../../models/User");
const ExamTimetable = require("../../models/ExamTimetable");

exports.renderTimetable = async (req, res) => {
  try {
    const student = await User.findById(req.session.userId).populate('batch').lean();
    if (!student) return res.redirect("/student/login");

    const studentBatchId = student.batch ? student.batch._id : null;
    if (!studentBatchId) {
      return res.render("student/timetable", { student, entries: [], success: null, error: "No batch assigned to your profile." });
    }

    const entries = await ExamTimetable.find({ batch: studentBatchId })
      .sort({ examDate: 1 })
      .lean();

    res.render("student/timetable", {
      student,
      entries,
      success: req.session.success || null,
      error: req.session.error || null
    });
    req.session.success = null;
    req.session.error = null;
  } catch (err) {
    console.error("Error fetching student timetable:", err);
    res.status(500).send("Server Error");
  }
};

exports.processTimetableBulk = async (req, res) => {
  try {
    const student = await User.findById(req.session.userId).populate('batch');
    if (!student) return res.redirect("/student/login");

    const studentBatchId = student.batch ? student.batch._id : null;
    if (!studentBatchId) {
      req.session.error = "No batch assigned to your profile.";
      return res.redirect("/student/timetable");
    }

    const { examType, subjects, dates, chapters } = req.body;
    if (!examType || !subjects || !dates || !chapters) {
      req.session.error = "All fields are required.";
      return res.redirect("/student/timetable");
    }

    const operations = [];
    for (let i = 0; i < subjects.length; i++) {
      if (!subjects[i] || !dates[i]) continue;
      operations.push({
        batch: studentBatchId,
        examType,
        subject: subjects[i],
        examDate: new Date(dates[i]),
        chapters: chapters[i] || "All",
        addedBy: "student",
        addedById: student.studentId,
        addedByName: student.studentName,
        addedByBatch: studentBatchId
      });
    }

    if (operations.length > 0) {
      await ExamTimetable.insertMany(operations);
      req.session.success = `Successfully scheduled ${operations.length} exams!`;
    } else {
      req.session.error = "No valid exam rows to add.";
    }
    res.redirect("/student/timetable");
  } catch (err) {
    console.error("Error bulk adding student timetable:", err);
    req.session.error = "Failed to schedule exams.";
    res.redirect("/student/timetable");
  }
};

exports.processTimetableEdit = async (req, res) => {
  try {
    const student = await User.findById(req.session.userId);
    if (!student) return res.redirect("/student/login");

    const entry = await ExamTimetable.findById(req.params.id);
    if (!entry) {
      req.session.error = "Exam entry not found.";
      return res.redirect("/student/timetable");
    }

    if (entry.addedBy !== "student" || entry.addedById !== student.studentId) {
      req.session.error = "You are not authorized to edit this exam.";
      return res.redirect("/student/timetable");
    }

    const { examType, subject, examDate, chapters } = req.body;
    entry.examType = examType;
    entry.subject = subject;
    entry.examDate = new Date(examDate);
    entry.chapters = chapters;

    await entry.save();
    req.session.success = "Exam entry updated successfully!";
    res.redirect("/student/timetable");
  } catch (err) {
    console.error("Error editing student timetable:", err);
    req.session.error = "Failed to update exam entry.";
    res.redirect("/student/timetable");
  }
};

exports.processTimetableDelete = async (req, res) => {
  try {
    const student = await User.findById(req.session.userId);
    if (!student) return res.redirect("/student/login");

    const entry = await ExamTimetable.findById(req.params.id);
    if (!entry) {
      req.session.error = "Exam entry not found.";
      return res.redirect("/student/timetable");
    }

    if (entry.addedBy !== "student" || entry.addedById !== student.studentId) {
      req.session.error = "You are not authorized to delete this exam.";
      return res.redirect("/student/timetable");
    }

    await ExamTimetable.findByIdAndDelete(req.params.id);
    req.session.success = "Exam entry deleted successfully!";
    res.redirect("/student/timetable");
  } catch (err) {
    console.error("Error deleting student timetable:", err);
    req.session.error = "Failed to delete exam entry.";
    res.redirect("/student/timetable");
  }
};
