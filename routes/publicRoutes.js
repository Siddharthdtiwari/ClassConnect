const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Fee = require('../models/Fee');
const User = require('../models/User');
const Batch = require('../models/Batch');
const Score = require('../models/Score');
const Attendance = require('../models/Attendance');
const Test = require('../models/Test');

const { generateReceiptPDF } = require('../utils/pdf/receiptGenerator');
const { generateFeeSummaryPDF } = require('../utils/pdf/feeSummaryGenerator');
const { generateStudentReportPDF } = require('../utils/pdf/reportCardGenerator');
const { verifySignature } = require('../utils/hashUtils');
const { renderError } = require("../utils/renderError");

// Public route to view fee receipt PDF
router.get('/public/receipt/:feeId', async (req, res) => {
  try {
    const feeId = req.params.feeId;
    if (!mongoose.Types.ObjectId.isValid(feeId)) {
      return renderError(req, res, 404, 'Invalid Receipt ID');
    }

    const fee = await Fee.findById(feeId).populate('batch');
    if (!fee) return renderError(req, res, 404, 'Receipt not found');
    if (fee.status !== 'Paid') return renderError(req, res, 400, 'Receipt not available for unpaid fees');

    // studentId only uniquely identifies a student together with batch, so prefer the
    // fee's own batch first. If that fails (e.g. the student was later moved to a
    // different batch), fee.userRef — where present — points at the exact student
    // unambiguously; only fall back to a bare studentId lookup for older records
    // that predate userRef, where a same-studentId collision is possible.
    let student = await User.findOne({ studentId: fee.studentId, batch: fee.batch._id }).populate('batch');
    if (!student && fee.userRef) {
      student = await User.findById(fee.userRef).populate('batch');
    }
    if (!student) {
      student = await User.findOne({ studentId: fee.studentId }).populate('batch');
    }
    if (!student) return renderError(req, res, 404, 'Student not found');

    // Generate inline PDF
    await generateReceiptPDF(fee, student, res, 'inline');
  } catch (err) {
    console.error('Error serving public receipt:', err);
    renderError(req, res, 500, 'Error generating receipt');
  }
});

// Public route to view fee summary PDF
router.get('/public/fee-summary/:studentId', async (req, res) => {
  try {
    const studentId = req.params.studentId;
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return renderError(req, res, 404, 'Invalid Student ID');
    }

    const student = await User.findById(studentId).populate('batch');
    if (!student) return renderError(req, res, 404, 'Student not found');

    const academicYear = student.batch ? student.batch.academicYear : '2025-26'; // Default fallback

    // Logic from feeController.js to compute feesByMonth and totalDue
    const { NA_STATUS, naMonthSet } = require('../utils/feeHelpers');
    const { ACADEMIC_MONTHS } = require('../utils/constants');
    // studentId is only unique per (studentId, batch) — a student who has been in
    // more than one batch (promoted, re-enrolled) can share their studentId string
    // with an unrelated student in another batch, so this has to be batch-scoped
    // at the query itself, not filtered afterward (naMonths below would otherwise
    // pick up N/A months belonging to a different batch entirely).
    const batchId = student.batch ? String(student.batch._id) : null;
    const studentFees = await Fee.find({ studentId: student.studentId, batch: batchId }).lean();
    const naMonths = naMonthSet(studentFees);

    // A month with no Fee record is only actually "Due" once its due date has passed —
    // the PDF generator (utils/pdf/feeSummaryGenerator.js) renders 'Due' in red and
    // anything else as a neutral "UPCOMING" badge, so this has to match its due-date
    // cutoff exactly or overdue months quietly show as upcoming instead of red.
    const calendarToAcademic = { 4: 0, 5: 1, 6: 2, 7: 3, 8: 4, 9: 5, 10: 6, 11: 7, 0: 8, 1: 9, 2: 10, 3: 11 };
    const FEE_DUE_DAY = 10;
    const now = new Date();
    const currentAcademicIndex = calendarToAcademic[now.getMonth()];
    const monthsElapsed = now.getDate() >= FEE_DUE_DAY ? currentAcademicIndex + 1 : currentAcademicIndex;

    let totalDue = 0;
    const feesByMonth = [];
    const monthlyFee = Number(student.monthlyFee) || 0;

    for (let idx = 0; idx < ACADEMIC_MONTHS.length; idx++) {
      const month = ACADEMIC_MONTHS[idx];
      if (naMonths.has(month)) {
        feesByMonth.push({ month, amount: 0, status: 'N/A', reason: NA_STATUS });
        continue;
      }

      const feeRecord = studentFees.find(f => f.month === month);
      if (feeRecord) {
        if (feeRecord.status === 'Unpaid') {
          totalDue += Number(feeRecord.amount || monthlyFee);
        }
        feesByMonth.push({
          month,
          amount: Number(feeRecord.amount || monthlyFee),
          status: feeRecord.status || 'Paid',
          datePaid: feeRecord.datePaid,
          year: feeRecord.year,
          receiptNo: feeRecord.receiptNo
        });
      } else if (idx < monthsElapsed) {
        totalDue += monthlyFee;
        feesByMonth.push({
          month,
          amount: monthlyFee,
          status: 'Due'
        });
      } else {
        feesByMonth.push({
          month,
          amount: monthlyFee,
          status: 'Upcoming'
        });
      }
    }

    // Generate inline PDF
    await generateFeeSummaryPDF(student, feesByMonth, totalDue, res, 'inline');
  } catch (err) {
    console.error('Error serving public fee summary:', err);
    renderError(req, res, 500, 'Error generating fee summary');
  }
});

// Public route to view / download student performance report PDF
const handleStudentReport = async (req, res) => {
  try {
    const { studentId, signature } = req.params;
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return renderError(req, res, 404, 'Invalid Student ID');
    }

    // Verify signature if provided
    if (signature && !verifySignature(studentId, signature)) {
      console.warn(`Invalid signature for student report ${studentId}`);
    }

    const student = await User.findById(studentId).populate('batch').lean();
    if (!student) return renderError(req, res, 404, 'Student not found');

    const sId = student.studentId;
    const batchId = student.batch ? student.batch._id : null;

    // studentId only uniquely identifies a student together with batch (see the
    // fee-summary route above for why) — every one of these has to be scoped by
    // batchId or a student sharing this studentId string in another batch could
    // leak their fees/scores/attendance into this report.
    const { NA_STATUS } = require('../utils/feeHelpers');
    const recentFees = await Fee.find({ studentId: sId, batch: batchId, status: { $in: ["Paid", NA_STATUS] } })
      .sort({ datePaid: 1 })
      .lean();

    const recentScores = await Score.find({ studentId: sId, batch: batchId })
      .populate("testId", "subject topic testDate")
      .sort({ createdAt: 1 })
      .lean();

    const allAttendanceRecords = await Attendance.find({
      "records.studentId": sId,
      batch: batchId
    }).lean();

    let presentDays = 0, absentDays = 0, totalDays = 0;
    allAttendanceRecords.forEach((dayRecord) => {
      totalDays++;
      const record = dayRecord.records.find((r) => r.studentId === sId);
      if (record && record.status === "P") presentDays++;
      if (record && record.status === "A") absentDays++;
    });

    const attendancePercentage = totalDays > 0 ? ((presentDays / (presentDays + absentDays)) * 100).toFixed(1) : 0;

    let studentRank = "-";
    if (batchId) {
      const allStudents = await User.find({ batch: batchId }).sort({ points: -1 }).lean();
      const rankIndex = allStudents.findIndex(s => s._id.toString() === student._id.toString());
      if (rankIndex !== -1) studentRank = rankIndex + 1;
    }

    const mode = req.query.dl === '1' ? 'attachment' : 'inline';

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
      mode
    );
  } catch (err) {
    console.error('Error generating public student report:', err);
    if (!res.headersSent) {
      renderError(req, res, 500, 'Error generating student report');
    }
  }
};

router.get('/public/report/:studentId/:signature', handleStudentReport);
router.get('/public/report/:studentId', handleStudentReport);

// Public route to view test question paper
const handlePublicTest = async (req, res) => {
  try {
    const { testId, signature } = req.params;
    if (!mongoose.Types.ObjectId.isValid(testId)) {
      return renderError(req, res, 404, 'Invalid Test ID');
    }

    const test = await Test.findById(testId).populate('batch').lean();
    if (!test) return renderError(req, res, 404, 'Test not found');

    if (test.questionPaper) {
      // If it's a URL or file path, redirect/serve
      return res.redirect(test.questionPaper);
    } else if (test.htmlContent) {
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>${test.testName} - Question Paper</title>
          <style>body { font-family: sans-serif; padding: 40px; max-width: 800px; margin: auto; line-height: 1.6; }</style>
        </head>
        <body>
          <h2>${test.testName} (${test.subject})</h2>
          <p><strong>Total Marks:</strong> ${test.totalMarks}</p>
          <hr/>
          <div>${test.htmlContent}</div>
        </body>
        </html>
      `);
    } else {
      return renderError(req, res, 404, 'Question paper not uploaded for this test.');
    }
  } catch (err) {
    console.error('Error serving public test:', err);
    renderError(req, res, 500, 'Error loading test paper');
  }
};

router.get('/public/test/:testId/:signature', handlePublicTest);
router.get('/public/test/:testId', handlePublicTest);

module.exports = router;
