const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Fee = require('../models/Fee');
const User = require('../models/User');
const Batch = require('../models/Batch');

const { generateReceiptPDF } = require('../utils/pdf/receiptGenerator');
const { generateFeeSummaryPDF } = require('../utils/pdf/feeSummaryGenerator');

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

    const student = await User.findById(fee.student).populate('batch');
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
    const { NA_STATUS, billableMonths, naMonthSet } = require('../utils/feeHelpers');
    const allFees = await Fee.find({ student: studentId }).lean();
    
    let totalDue = 0;
    const feesByMonth = [];
    const monthlyFee = Number(student.monthlyFee) || 0;
    
    for (const month of billableMonths) {
      if (naMonthSet.has(month)) {
        feesByMonth.push({ month, amount: 0, status: 'N/A', reason: NA_STATUS });
        continue;
      }
      
      const feeRecord = allFees.find(f => f.month === month && f.year === academicYear);
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

module.exports = router;
