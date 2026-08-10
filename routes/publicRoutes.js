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

// Public route to view fee receipt PDF
router.get('/public/receipt/:feeId', async (req, res) => {
  try {
    const feeId = req.params.feeId;
    if (!mongoose.Types.ObjectId.isValid(feeId)) {
      return res.status(404).send('Invalid Receipt ID');
    }

    const fee = await Fee.findById(feeId).populate('batch');
    if (!fee) return res.status(404).send('Receipt not found');
    if (fee.status !== 'Paid') return res.status(400).send('Receipt not available for unpaid fees');

    let student = await User.findOne({ studentId: fee.studentId, batch: fee.batch._id }).populate('batch');
    if (!student) {
      student = await User.findOne({ studentId: fee.studentId }).populate('batch');
    }
    if (!student) return res.status(404).send('Student not found');

    // Generate inline PDF
    await generateReceiptPDF(fee, student, res, 'inline');
  } catch (err) {
    console.error('Error serving public receipt:', err);
    res.status(500).send('Error generating receipt');
  }
});

// Public route to view fee summary PDF
router.get('/public/fee-summary/:studentId', async (req, res) => {
  try {
    const studentId = req.params.studentId;
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(404).send('Invalid Student ID');
    }

    const student = await User.findById(studentId).populate('batch');
    if (!student) return res.status(404).send('Student not found');

    const academicYear = student.batch ? student.batch.academicYear : '2025-26'; // Default fallback
    
    // Logic from feeController.js to compute feesByMonth and totalDue
    const { NA_STATUS, naMonthSet } = require('../utils/feeHelpers');
    const { ACADEMIC_MONTHS } = require('../utils/constants');
    const allFees = await Fee.find({ studentId: student.studentId }).lean();
    const naMonths = naMonthSet(allFees);
    
    const batchId = student.batch ? String(student.batch._id) : null;
    const studentFees = allFees.filter(f => String(f.batch && f.batch._id || f.batch) === batchId);
    
    let totalDue = 0;
    const feesByMonth = [];
    const monthlyFee = Number(student.monthlyFee) || 0;
    
    for (const month of ACADEMIC_MONTHS) {
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
      } else {
        totalDue += monthlyFee;
        feesByMonth.push({
          month,
          amount: monthlyFee,
          status: 'Unpaid'
        });
      }
    }

    // Generate inline PDF
    await generateFeeSummaryPDF(student, feesByMonth, totalDue, res, 'inline');
  } catch (err) {
    console.error('Error serving public fee summary:', err);
    res.status(500).send('Error generating fee summary');
  }
});

// Public route to view / download student performance report PDF
const handleStudentReport = async (req, res) => {
  try {
    const { studentId, signature } = req.params;
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(404).send('Invalid Student ID');
    }

    // Verify signature if provided
    if (signature && !verifySignature(studentId, signature)) {
      console.warn(`Invalid signature for student report ${studentId}`);
    }

    const student = await User.findById(studentId).populate('batch').lean();
    if (!student) return res.status(404).send('Student not found');

    const sId = student.studentId;
    const batchId = student.batch ? student.batch._id : null;

    const recentFees = await Fee.find({ studentId: sId, status: "Paid" })
      .sort({ datePaid: 1 })
      .lean();

    const recentScores = await Score.find({ studentId: sId })
      .populate("testId", "subject topic testDate")
      .sort({ createdAt: 1 })
      .lean();

    const allAttendanceRecords = await Attendance.find({
      "records.studentId": sId
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
      res.status(500).send('Error generating student report');
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
      return res.status(404).send('Invalid Test ID');
    }

    const test = await Test.findById(testId).populate('batch').lean();
    if (!test) return res.status(404).send('Test not found');

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
      return res.status(404).send('Question paper not uploaded for this test.');
    }
  } catch (err) {
    console.error('Error serving public test:', err);
    res.status(500).send('Error loading test paper');
  }
};

router.get('/public/test/:testId/:signature', handlePublicTest);
router.get('/public/test/:testId', handlePublicTest);

module.exports = router;
