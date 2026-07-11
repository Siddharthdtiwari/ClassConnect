const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { requireStudentApiLogin } = require('../../middlewares/apiAuth');
const User = require('../../models/User');
const Score = require('../../models/Score');
const Fee = require('../../models/Fee');
const Attendance = require('../../models/Attendance');
const Test = require('../../models/Test');
const ExamTimetable = require('../../models/ExamTimetable');
const StudyMaterial = require('../../models/StudyMaterial');
const Batch = require('../../models/Batch');
const Syllabus = require('../../models/Syllabus');

router.use(requireStudentApiLogin);

// ========== DASHBOARD ==========
router.get('/dashboard', async (req, res) => {
  try {
    const student = req.user;
    const studentId = student.studentId;

    const recentFees = await Fee.find({ studentId, status: 'Paid', batch: student.batch._id })
      .sort({ datePaid: -1 })
      .limit(6)
      .lean();

    const recentScores = await Score.find({ studentId, batch: student.batch._id })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('testId', 'testDate totalMarks subject')
      .lean();

    const allAttendanceRecords = await Attendance.find({
      'records.studentId': studentId,
      batch: student.batch._id,
    }).lean();

    let presentDays = 0, absentDays = 0, totalDays = 0;
    allAttendanceRecords.forEach((dayRecord) => {
      totalDays++;
      const record = dayRecord.records.find((r) => r.studentId === studentId);
      if (record && record.status === 'P') presentDays++;
      if (record && record.status === 'A') absentDays++;
    });

    const attendancePercentage =
      (presentDays + absentDays) > 0 ? ((presentDays / (presentDays + absentDays)) * 100).toFixed(1) : 0;

    const allStudents = await User.find({ batch: student.batch._id }).sort({ points: -1 }).lean();
    let studentRank = '-';
    const rankIndex = allStudents.findIndex(s => s._id.toString() === student._id.toString());
    if (rankIndex !== -1) studentRank = rankIndex + 1;

    res.json({
      student: {
        id: student._id,
        name: student.studentName,
        studentId: student.studentId,
        points: student.points || 0,
        rank: studentRank,
        profilePhoto: student.profilePhoto,
        batch: student.batch
      },
      metrics: { attendancePercentage, presentDays, absentDays, totalDays },
      recentScores,
      recentFees
    });
  } catch (err) {
    console.error('Student API dashboard error:', err);
    res.status(500).json({ error: 'Error loading dashboard' });
  }
});

// ========== ATTENDANCE ==========
router.get('/attendance', async (req, res) => {
  try {
    const student = req.user;
    const studentId = student.studentId;
    const attendanceDocs = await Attendance.find({ batch: student.batch._id }).lean();

    const attendanceData = {};
    attendanceDocs.forEach((doc) => {
      const studentRecord = doc.records.find((r) => r.studentId === studentId);
      if (studentRecord) {
        let status;
        if (studentRecord.status === 'P') status = 'present';
        else if (studentRecord.status === 'A') status = 'absent';
        else if (studentRecord.status === 'H') status = 'holiday';
        const dateObj = new Date(doc.date);
        const formatted = dateObj.toISOString().split('T')[0];
        attendanceData[formatted] = status;
      }
    });

    res.json({ attendanceData });
  } catch (err) {
    console.error('Student API attendance error:', err);
    res.status(500).json({ error: 'Error fetching attendance' });
  }
});

// ========== FEES ==========
router.get('/fees', async (req, res) => {
  try {
    const student = req.user;
    const months = [
      'May', 'June', 'July', 'August', 'September', 'October',
      'November', 'December', 'January', 'February', 'March', 'April'
    ];
    const calendarToAcademic = { 4:0, 5:1, 6:2, 7:3, 8:4, 9:5, 10:6, 11:7, 0:8, 1:9, 2:10, 3:11 };
    const now = new Date();
    const currentMonthIndex = now.getMonth();
    const currentAcademicIndex = calendarToAcademic[currentMonthIndex];
    const FEE_DUE_DAY = 10;
    const monthsElapsed = now.getDate() >= FEE_DUE_DAY ? currentAcademicIndex + 1 : currentAcademicIndex;

    let academicStartYear;
    if (student.batch && student.batch.academicYear) {
      academicStartYear = parseInt(student.batch.academicYear.split('-')[0]);
    } else {
      academicStartYear = currentMonthIndex >= 4 ? now.getFullYear() : now.getFullYear() - 1;
    }
    const yearForMonthIndex = (idx) => idx < 8 ? academicStartYear : academicStartYear + 1;

    const fees = await Fee.find({ studentId: student.studentId, batch: student.batch._id }).lean();

    const feesByMonth = months.map((month, idx) => {
      const feeYear = yearForMonthIndex(idx);
      const feeRecord = fees.find((f) => f.month === month && Number(f.year) === feeYear);
      if (feeRecord) {
        return { _id: feeRecord._id, month, amount: Number(feeRecord.amount || 0), status: feeRecord.status || 'Paid', datePaid: feeRecord.datePaid, year: feeYear, receiptNo: feeRecord.receiptNo };
      } else if (idx < monthsElapsed) {
        return { month, amount: Number(student.monthlyFee || 0), status: 'Due', datePaid: null, year: feeYear };
      } else {
        return { month, amount: Number(student.monthlyFee || 0), status: 'Not Yet Due', datePaid: null, year: feeYear };
      }
    });

    const monthlyFee = Number(student.monthlyFee || 0);
    const dueMonthsCount = feesByMonth.filter((f) => f.status === 'Due').length;
    const totalDue = monthlyFee * dueMonthsCount;

    res.json({ feesByMonth, totalDue, monthlyFee });
  } catch (err) {
    console.error('Student API fees error:', err);
    res.status(500).json({ error: 'Error loading fees' });
  }
});

// ========== TEST SCORES ==========
router.get('/scores', async (req, res) => {
  try {
    const student = req.user;
    const scores = await Score.find({ studentId: student.studentId, batch: student.batch._id })
      .populate('testId')
      .lean();

    const scoresBySubject = {};
    scores.forEach((score) => {
      const subject = score.testId?.subject || 'Unknown';
      if (!scoresBySubject[subject]) scoresBySubject[subject] = [];
      scoresBySubject[subject].push({
        testName: score.testName,
        topic: score.testId?.topic || 'No topic',
        score: score.score,
        percentage: score.percentage,
        total: score.testId?.totalMarks || 100,
        testDate: score.testId?.testDate,
      });
    });

    res.json({ scoresBySubject });
  } catch (err) {
    console.error('Student API scores error:', err);
    res.status(500).json({ error: 'Error fetching scores' });
  }
});

// ========== TIMETABLE ==========
router.get('/timetable', async (req, res) => {
  try {
    const student = req.user;
    const studentBatchId = student.batch ? student.batch._id : null;
    if (!studentBatchId) return res.json({ entries: [] });

    const entries = await ExamTimetable.find({
      batch: studentBatchId,
      $or: [
        { addedBy: 'teacher' },
        { addedBy: 'student', addedById: student.studentId }
      ]
    }).sort({ examDate: 1 }).lean();

    res.json({ entries });
  } catch (err) {
    console.error('Student API timetable error:', err);
    res.status(500).json({ error: 'Error fetching timetable' });
  }
});

// ========== LEADERBOARD ==========
router.get('/leaderboard', async (req, res) => {
  try {
    const student = req.user;
    const { calculateCurrentAcademicYear } = require('../../utils/academicYear');
    let targetYear = calculateCurrentAcademicYear();

    let batches = await Batch.find({ academicYear: targetYear }).select('_id').lean();
    let viewingBatches = batches.map(b => b._id);
    let allStudents = await User.find({ batch: { $in: viewingBatches } }).lean();

    const hasPoints = allStudents.some(s => s.points > 0);
    if (!hasPoints) {
      const startYear = parseInt(targetYear.split('-')[0]);
      const fallbackYear = `${startYear - 1}-${String(startYear).slice(2)}`;
      const prevBatches = await Batch.find({ academicYear: fallbackYear }).select('_id').lean();
      const prevStudents = await User.find({ batch: { $in: prevBatches.map(b => b._id) } }).lean();
      if (prevStudents.length > 0) { allStudents = prevStudents; targetYear = fallbackYear; }
    }

    allStudents.forEach((s) => { if (typeof s.points !== 'number') s.points = 0; });
    allStudents.sort((a, b) => b.points - a.points);

    const formatLeaderboard = (list) => list.map((s, i) => ({
      rank: i + 1, name: s.studentName, studentId: s.studentId, score: s.points,
      avatar: s.profilePhoto || s.studentName.split(' ').map(n => n[0]).join('').toUpperCase(),
    }));

    const globalLeaderboard = formatLeaderboard(allStudents);
    const batchStudents = allStudents.filter(s => s.batch && s.batch.toString() === student.batch._id.toString());
    const batchLeaderboard = formatLeaderboard(batchStudents);

    res.json({ globalLeaderboard, batchLeaderboard, viewingYear: targetYear });
  } catch (err) {
    console.error('Student API leaderboard error:', err);
    res.status(500).json({ error: 'Error fetching leaderboard' });
  }
});

// ========== STUDY MATERIALS ==========
router.get('/content', async (req, res) => {
  try {
    const student = req.user;
    const studentBatchId = student.batch ? student.batch._id : null;
    if (!studentBatchId) return res.json({ materials: [], tests: [] });

    const materials = await StudyMaterial.find({ batch: studentBatchId }).lean();
    const tests = await Test.find({ batch: studentBatchId }).lean();

    res.json({ materials, tests });
  } catch (err) {
    console.error('Student API content error:', err);
    res.status(500).json({ error: 'Error loading content' });
  }
});

// ========== ONLINE FEE PAYMENT (Razorpay) ==========
// Reuses the web portal's controller: order creation + HMAC verification + fee recording + receipt email.
const studentFeeController = require('../../controllers/student/feeController');

router.post('/fees/create-order', async (req, res, next) => {
  // Wrap to append the public key id, which the mobile checkout needs (web gets it via server render).
  const originalJson = res.json.bind(res);
  res.json = (body) => originalJson(
    body && body.id ? { ...body, key_id: process.env.RAZORPAY_KEY_ID } : body
  );
  studentFeeController.createOrder(req, res, next);
});

router.post('/fees/verify-payment', studentFeeController.verifyPayment);

// ========== SYLLABUS ==========
router.get('/syllabus', async (req, res) => {
  try {
    const student = req.user;
    const studentBatchId = student.batch ? student.batch._id : null;
    if (!studentBatchId) return res.json({ records: [] });

    const records = await Syllabus.find({ batch: studentBatchId }).populate('batch').lean();
    res.json({ records });
  } catch (err) {
    console.error('Student API syllabus error:', err);
    res.status(500).json({ error: 'Error loading syllabus' });
  }
});

// ========== PROFILE ==========
router.get('/profile', async (req, res) => {
  try {
    const student = req.user;
    res.json({
      id: student._id,
      name: student.studentName,
      studentId: student.studentId,
      email: student.email,
      mobileNo: student.mobileNo,
      profilePhoto: student.profilePhoto,
      points: student.points,
      monthlyFee: student.monthlyFee,
      batch: student.batch,
    });
  } catch (err) {
    res.status(500).json({ error: 'Error loading profile' });
  }
});

router.put('/profile', async (req, res) => {
  try {
    const { name, email, mobileNo, password } = req.body;
    const student = await User.findById(req.user._id);
    
    if (name) {
      student.studentName = name;
      student.name = name;
    }
    if (email) student.email = email;
    if (mobileNo) student.mobileNo = mobileNo;
    if (password) {
      const bcrypt = require('bcrypt');
      student.password = await bcrypt.hash(password, 12);
    }
    
    await student.save();
    res.json({ success: true, student });
  } catch (err) {
    res.status(500).json({ error: 'Error updating profile' });
  }
});

module.exports = router;
