const mongoose = require("mongoose");
const User = require("../../models/User");
const Score = require("../../models/Score");
const Fee = require("../../models/Fee");
const Attendance = require("../../models/Attendance");
const { generateStudentReportPDF } = require("../../utils/pdfUtils");

exports.renderDashboard = async (req, res) => {
  try {
    const student = await User.findById(req.session.userId).populate('batch').lean();
    if (!student) return res.redirect("/student/login");

    const studentId = student.studentId;

    // Optimize: Fetch viewing batches once
    const viewingBatches = await mongoose.model('Batch').find({ academicYear: req.viewingYear }).distinct('_id');

    const recentFees = await Fee.find({ studentId: studentId, status: "Paid", batch: student.batch._id })
      .sort({ datePaid: -1 })
      .limit(6)
      .lean();

    const recentScores = await Score.find({ studentId: studentId, batch: student.batch._id })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('testId', 'testDate totalMarks subject')
      .lean();

    const allAttendanceRecords = await Attendance.find({
      "records.studentId": studentId,
      batch: student.batch._id,
    }).lean();

    let presentDays = 0;
    let absentDays = 0;
    let totalDays = 0;

    allAttendanceRecords.forEach((dayRecord) => {
      totalDays++;
      const record = dayRecord.records.find((r) => r.studentId === studentId);
      if (record && record.status === "P") presentDays++;
      if (record && record.status === "A") absentDays++;
    });

    const attendancePercentage =
      (presentDays + absentDays) > 0 ? ((presentDays / (presentDays + absentDays)) * 100).toFixed(1) : 0;

    const scoreLabels = recentScores.map((score) => score.testName).reverse();
    const scoreData = recentScores.map((score) => score.percentage).reverse();

    const allStudents = await User.find({ batch: student.batch._id })
      .sort({ points: -1 })
      .lean();

    let studentRank = "-";
    const rankIndex = allStudents.findIndex(s => s._id.toString() === student._id.toString());
    if (rankIndex !== -1) {
      studentRank = rankIndex + 1;
    }

    res.render("student/dashboard", {
      student,
      recentFees,
      recentScores,
      attendancePercentage,
      presentDays,
      absentDays,
      totalDays,
      scoreLabels,
      scoreData,
      studentRank,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading dashboard");
  }
};

exports.generateReport = async (req, res) => {
  try {
    const student = await User.findById(req.session.userId).populate('batch').lean();
    if (!student) return res.redirect("/student/login");

    const studentId = student.studentId;

    const recentFees = await Fee.find({ studentId: studentId, status: "Paid", batch: student.batch._id })
      .sort({ datePaid: 1 })
      .lean();

    const recentScores = await Score.find({ studentId: studentId, batch: student.batch._id })
      .populate("testId", "subject topic testDate")
      .sort({ createdAt: 1 })
      .lean();

    const allAttendanceRecords = await Attendance.find({
      "records.studentId": studentId,
      batch: student.batch._id,
    }).lean();

    let presentDays = 0;
    let absentDays = 0;
    let totalDays = 0;

    allAttendanceRecords.forEach((dayRecord) => {
      totalDays++;
      const record = dayRecord.records.find((r) => r.studentId === studentId);
      if (record && record.status === "P") presentDays++;
      if (record && record.status === "A") absentDays++;
    });

    const attendancePercentage =
      totalDays > 0 ? ((presentDays / (presentDays + absentDays)) * 100).toFixed(1) : 0;

    const allStudents = await User.find({ batch: student.batch._id })
      .sort({ points: -1 })
      .lean();

    let studentRank = "-";
    const rankIndex = allStudents.findIndex(s => s._id.toString() === student._id.toString());
    if (rankIndex !== -1) {
      studentRank = rankIndex + 1;
    }

    await generateStudentReportPDF(
      student,
      {
        recentFees,
        recentScores,
        attendancePercentage,
        presentDays,
        absentDays,
        totalDays,
        studentRank,
      },
      res,
      "inline"
    );
  } catch (err) {
    console.error("Error generating student report:", err);
    if (!res.headersSent) {
      res.status(500).send("Server Error");
    }
  }
};
