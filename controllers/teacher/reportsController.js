const User = require("../../models/User");
const Batch = require("../../models/Batch");
const Fee = require("../../models/Fee");
const Test = require("../../models/Test");
const Attendance = require("../../models/Attendance");
const StudyMaterial = require("../../models/StudyMaterial");
const ExamTimetable = require("../../models/ExamTimetable");

exports.renderReports = async (req, res) => {
  try {
    const batchIds = req.viewingBatches || [];

    // Aggregate stats in parallel
    const [
      totalStudents,
      totalBatches,
      activeBatches,
      totalTests,
      totalMaterials,
      paidFees,
      recentFees,
      allBatches,
    ] = await Promise.all([
      User.countDocuments({ batch: { $in: batchIds } }),
      Batch.countDocuments({ academicYear: req.viewingYear }),
      Batch.countDocuments({ academicYear: req.viewingYear, isActive: true }),
      Test.countDocuments({ batch: { $in: batchIds } }),
      StudyMaterial.countDocuments({ batch: { $in: batchIds } }),
      Fee.find({ status: "Paid", batch: { $in: batchIds } }).lean(),
      Fee.find({ status: "Paid", batch: { $in: batchIds } })
        .populate("batch")
        .sort({ datePaid: -1 })
        .limit(8)
        .lean(),
      Batch.find({ academicYear: req.viewingYear }).lean(),
    ]);

    const totalRevenue = paidFees.reduce((sum, f) => sum + (f.amount || 0), 0);
    const totalPayments = paidFees.length;

    // Count attendance records & compute attendance stats
    let attendanceDays = 0;
    let totalPresent = 0;
    let totalAbsent = 0;
    let totalHoliday = 0;
    let totalRecords = 0;
    try {
      const attendanceDocs = await Attendance.find({ batch: { $in: batchIds } }).lean();
      attendanceDays = attendanceDocs.length;
      for (const doc of attendanceDocs) {
        if (doc.records && doc.records.length) {
          for (const r of doc.records) {
            totalRecords++;
            if (r.status === "P") totalPresent++;
            else if (r.status === "A") totalAbsent++;
            else if (r.status === "H") totalHoliday++;
          }
        }
      }
    } catch (e) { /* ignore */ }

    const attendanceRate = totalRecords > 0
      ? Math.round((totalPresent / (totalPresent + totalAbsent)) * 100)
      : 0;

    // Count pending/unpaid fees
    let pendingFees = 0;
    try {
      pendingFees = await Fee.countDocuments({ status: { $ne: "Paid" }, batch: { $in: batchIds } });
    } catch (e) { /* ignore */ }

    // Count upcoming exams
    let upcomingExams = 0;
    try {
      upcomingExams = await ExamTimetable.countDocuments({
        batch: { $in: batchIds },
        examDate: { $gte: new Date() }
      });
    } catch (e) { /* ignore */ }

    // Batch-wise enrollment breakdown
    const batchEnrollment = [];
    try {
      for (const batch of allBatches) {
        const count = await User.countDocuments({ batch: batch._id });
        batchEnrollment.push({ name: batch.name, students: count, isActive: batch.isActive !== false });
      }
      batchEnrollment.sort((a, b) => b.students - a.students);
    } catch (e) { /* ignore */ }

    // Recent tests
    let recentTests = [];
    try {
      recentTests = await Test.find({ batch: { $in: batchIds } })
        .populate("batch")
        .sort({ createdAt: -1 })
        .limit(6)
        .lean();
    } catch (e) { /* ignore */ }

    res.render("teacher/reports", {
      stats: {
        totalStudents,
        totalBatches,
        activeBatches,
        totalTests,
        totalMaterials,
        totalRevenue,
        totalPayments,
        attendanceDays,
        pendingFees,
        upcomingExams,
        attendanceRate,
        totalPresent,
        totalAbsent,
        totalRecords,
      },
      recentFees,
      batchEnrollment,
      recentTests,
    });
  } catch (err) {
    console.error("Reports hub error:", err);
    res.status(500).send("Error loading reports");
  }
};
