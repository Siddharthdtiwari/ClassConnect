const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { requireTeacherApiLogin } = require('../../middlewares/apiAuth');
const User = require('../../models/User');
const Batch = require('../../models/Batch');
const Teacher = require('../../models/Teacher');
const Test = require('../../models/Test');
const Fee = require('../../models/Fee');
const Score = require('../../models/Score');
const Attendance = require('../../models/Attendance');
const AuditLog = require('../../models/AuditLog');
const ExamTimetable = require('../../models/ExamTimetable');
const StudyMaterial = require('../../models/StudyMaterial');
const Syllabus = require('../../models/Syllabus');
const { calculateCurrentAcademicYear, getAvailableAcademicYears } = require('../../utils/academicYear');
const { logAudit } = require('../../utils/auditService');

router.use(requireTeacherApiLogin);

// ========== DASHBOARD ==========
router.get('/dashboard', async (req, res) => {
  try {
    const teacher = req.teacher;
    const academicYear = req.query.year || calculateCurrentAcademicYear();
    const yearBatches = await Batch.find({ academicYear }).distinct('_id');

    const [totalStudents, upcomingTestsCount, revenueAgg, upcomingTests, recentPayments, activeBatches] = await Promise.all([
      User.countDocuments({ batch: { $in: yearBatches } }),
      Test.countDocuments({ batch: { $in: yearBatches }, testDate: { $gte: new Date() } }),
      Fee.aggregate([{ $match: { batch: { $in: yearBatches }, status: 'Paid' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Test.find({ batch: { $in: yearBatches }, testDate: { $gte: new Date() } }).populate('batch').sort({ testDate: 1 }).limit(3).lean(),
      Fee.find({ batch: { $in: yearBatches }, status: 'Paid' }).populate('batch').sort({ datePaid: -1 }).limit(4).lean(),
      Batch.find({ academicYear, isActive: true }).lean(),
    ]);

    const totalRevenue = revenueAgg.length > 0 ? revenueAgg[0].total : 0;

    const batchCounts = await Promise.all(activeBatches.map(async (b) => {
      const count = await User.countDocuments({ batch: b._id });
      return { ...b, studentCount: count };
    }));

    res.json({
      teacher: { name: teacher.teacherName, teacherId: teacher.teacherId },
      metrics: { totalStudents, upcomingTests: upcomingTestsCount, totalRevenue },
      upcomingTests,
      recentPayments,
      activeBatches: batchCounts,
      academicYear,
      availableYears: getAvailableAcademicYears(5),
    });
  } catch (err) {
    console.error('Teacher API dashboard error:', err);
    res.status(500).json({ error: 'Error loading dashboard' });
  }
});

// ========== BATCH MANAGEMENT ==========
router.get('/batches', async (req, res) => {
  try {
    const academicYear = req.query.year || calculateCurrentAcademicYear();
    const batches = await Batch.find({ academicYear }).lean();
    const batchesWithCounts = await Promise.all(batches.map(async (batch) => {
      const studentCount = await User.countDocuments({ batch: batch._id });
      return { ...batch, studentCount };
    }));
    res.json({ batches: batchesWithCounts, academicYear });
  } catch (err) {
    res.status(500).json({ error: 'Error loading batches' });
  }
});

router.post('/batches', async (req, res) => {
  try {
    const { name, description } = req.body;
    const academicYear = req.body.academicYear || calculateCurrentAcademicYear();
    if (!name || name.trim() === '') return res.status(400).json({ error: 'Batch name is required' });
    const existing = await Batch.findOne({ name: name.trim(), academicYear });
    if (existing) return res.status(400).json({ error: 'Batch already exists' });
    const newBatch = new Batch({ name: name.trim(), academicYear, description: description?.trim() || '', isActive: true });
    await newBatch.save();
    await logAudit({ action: 'CREATE', entityType: 'Batch', entityId: newBatch._id, details: `Created batch: ${newBatch.name}`, academicYear });
    res.json({ success: true, batch: newBatch });
  } catch (err) {
    res.status(500).json({ error: 'Error creating batch' });
  }
});

router.put('/batches/:id', async (req, res) => {
  try {
    const { name, description, isActive } = req.body;
    const batch = await Batch.findById(req.params.id);
    if (!batch) return res.status(404).json({ error: 'Batch not found' });
    if (name) batch.name = name.trim();
    if (description !== undefined) batch.description = description.trim();
    if (isActive !== undefined) batch.isActive = isActive;
    await batch.save();
    await logAudit({ action: 'UPDATE', entityType: 'Batch', entityId: batch._id, details: `Updated batch: ${batch.name}`, academicYear: batch.academicYear });
    res.json({ success: true, batch });
  } catch (err) {
    res.status(500).json({ error: 'Error updating batch' });
  }
});

// ========== STUDENT MANAGEMENT ==========
router.get('/students', async (req, res) => {
  try {
    const academicYear = req.query.year || calculateCurrentAcademicYear();
    const batchIds = await Batch.find({ academicYear }).distinct('_id');
    const students = await User.find({ batch: { $in: batchIds } }).populate('batch').lean();
    const batches = await Batch.find({ academicYear }).lean();
    res.json({ students, batches });
  } catch (err) {
    res.status(500).json({ error: 'Error loading students' });
  }
});

router.get('/students/:id', async (req, res) => {
  try {
    const student = await User.findById(req.params.id).populate('batch').lean();
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const studentId = student.studentId;
    const recentFees = await Fee.find({ studentId, status: 'Paid', batch: student.batch._id }).sort({ datePaid: -1 }).lean();
    const recentScores = await Score.find({ studentId, batch: student.batch._id }).sort({ createdAt: -1 }).lean();
    const allAttendanceRecords = await Attendance.find({ 'records.studentId': studentId, batch: student.batch._id }).lean();

    let presentDays = 0, absentDays = 0, totalDays = 0;
    allAttendanceRecords.forEach((dayRecord) => {
      totalDays++;
      const record = dayRecord.records.find((r) => r.studentId === studentId);
      if (record && record.status === 'P') presentDays++;
      if (record && record.status === 'A') absentDays++;
    });
    const attendancePercentage = totalDays > 0 ? ((presentDays / (presentDays + absentDays)) * 100).toFixed(1) : 0;

    res.json({ student, recentFees, recentScores, metrics: { attendancePercentage, presentDays, absentDays, totalDays } });
  } catch (err) {
    res.status(500).json({ error: 'Error loading student profile' });
  }
});

// ========== ATTENDANCE MANAGEMENT ==========
router.get('/attendance', async (req, res) => {
  try {
    const academicYear = req.query.year || calculateCurrentAcademicYear();
    const batchIds = await Batch.find({ academicYear }).distinct('_id');
    const students = await User.find({ batch: { $in: batchIds } }).populate('batch').lean();
    const attendanceRecords = await Attendance.find({ batch: { $in: batchIds } }).lean();

    const attendanceMap = {};
    attendanceRecords.forEach((record) => {
      const dateString = record.date.toISOString().split('T')[0];
      attendanceMap[dateString] = {};
      (record.records || []).forEach((r) => (attendanceMap[dateString][r.studentId] = r.status));
    });

    res.json({ students, attendance: attendanceMap });
  } catch (err) {
    res.status(500).json({ error: 'Error loading attendance' });
  }
});

router.post('/attendance', async (req, res) => {
  try {
    const { date, records, batchId } = req.body;
    const academicYear = req.body.academicYear || calculateCurrentAcademicYear();
    let batchValue = batchId;

    if (!batchValue && records && records.length > 0) {
      const batchIds = await Batch.find({ academicYear }).distinct('_id');
      const student = await User.findOne({ studentId: records[0].studentId, batch: { $in: batchIds } }).lean();
      if (student) batchValue = student.batch;
    }

    let attendance = await Attendance.findOne({ date, batch: batchValue });
    if (attendance) {
      attendance.records = records;
    } else {
      attendance = new Attendance({ batch: batchValue, date: new Date(date), records });
    }
    await attendance.save();
    await logAudit({ action: 'UPDATE', entityType: 'Attendance', details: `Saved attendance for ${date}`, academicYear });
    res.json({ success: true, message: 'Attendance saved successfully!' });
  } catch (err) {
    console.error('Error saving attendance:', err);
    res.status(500).json({ success: false, message: 'Failed to save attendance.' });
  }
});

// ========== FEE MANAGEMENT ==========
router.get('/fees', async (req, res) => {
  try {
    const academicYear = req.query.year || calculateCurrentAcademicYear();
    const batchIds = await Batch.find({ academicYear }).distinct('_id');
    const students = await User.find({ batch: { $in: batchIds } }).populate('batch').lean();
    const allFees = await Fee.find({ batch: { $in: batchIds } }).populate('batch').lean();
    const batches = await Batch.find({ academicYear }).lean();

    const months = ['May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March', 'April'];

    const report = students.map((student) => {
      const studentFees = allFees.filter(f => f.studentId === student.studentId);
      let totalPaid = 0;
      const records = {};
      months.forEach((month) => {
        const feeRecord = studentFees.find((f) => f.month === month);
        if (feeRecord) {
          records[month] = { status: 'Paid', amount: feeRecord.amount, datePaid: feeRecord.datePaid, method: feeRecord.method };
          totalPaid += feeRecord.amount;
        } else {
          records[month] = { status: 'Unpaid' };
        }
      });
      const monthlyFee = student.monthlyFee || 0;
      const totalDue = monthlyFee * months.length;
      return {
        _id: student._id, studentName: student.studentName, studentId: student.studentId,
        standard: student.batch ? student.batch.name : 'Unknown', records, totalPaid, totalDue, balance: totalDue - totalPaid,
      };
    });

    res.json({ report, months, batches });
  } catch (err) {
    res.status(500).json({ error: 'Error loading fees' });
  }
});

router.post('/fees', async (req, res) => {
  try {
    const { studentId, batchId, amount, month, year, method, datePaid } = req.body;
    const studentObj = await User.findById(studentId).populate('batch');
    if (!studentObj) return res.status(404).json({ error: 'Student not found' });

    const existingFee = await Fee.findOne({ studentId: studentObj.studentId, month, year, batch: batchId });
    if (existingFee) return res.status(400).json({ error: 'Fee already exists for this month' });

    const fee = new Fee({
      studentId: studentObj.studentId, studentName: studentObj.studentName,
      studentEmail: studentObj.email || '', userRef: studentObj._id,
      batch: batchId, amount, month, year, method, datePaid, status: 'Paid'
    });
    await fee.save();
    const academicYear = calculateCurrentAcademicYear();
    await logAudit({ action: 'CREATE', entityType: 'Fee', entityId: fee._id, details: `Fee collected for ${studentObj.studentName} (${month} ${year}): ₹${amount}`, academicYear });
    res.json({ success: true, fee });
  } catch (err) {
    res.status(500).json({ error: 'Error adding fee' });
  }
});

// ========== TEST MANAGEMENT ==========
router.get('/tests', async (req, res) => {
  try {
    const academicYear = req.query.year || calculateCurrentAcademicYear();
    const batchIds = await Batch.find({ academicYear }).distinct('_id');
    const tests = await Test.find({ batch: { $in: batchIds } }).populate('batch').sort({ testDate: -1 }).lean();
    res.json({ tests });
  } catch (err) {
    res.status(500).json({ error: 'Error loading tests' });
  }
});

router.get('/tests/:batchId', async (req, res) => {
  try {
    const tests = await Test.find({ batch: req.params.batchId }).sort({ testDate: -1 }).lean();
    res.json({ tests });
  } catch (err) {
    res.status(500).json({ error: 'Error loading tests' });
  }
});

router.get('/scores/:batchId/:testId', async (req, res) => {
  try {
    const students = await User.find({ batch: req.params.batchId }).lean();
    const scores = await Score.find({ batch: req.params.batchId, testId: req.params.testId }).lean();
    const test = await Test.findById(req.params.testId).lean();
    res.json({ students, scores, test });
  } catch (err) {
    res.status(500).json({ error: 'Error loading scores' });
  }
});

// ========== TIMETABLE ==========
router.get('/timetable', async (req, res) => {
  try {
    const academicYear = req.query.year || calculateCurrentAcademicYear();
    const batchIds = await Batch.find({ academicYear }).distinct('_id');
    const entries = await ExamTimetable.find({ batch: { $in: batchIds } }).populate('batch').sort({ examDate: 1 }).lean();
    res.json({ entries });
  } catch (err) {
    res.status(500).json({ error: 'Error loading timetable' });
  }
});

// ========== SYLLABUS ==========
router.get('/syllabus', async (req, res) => {
  try {
    const academicYear = req.query.year || calculateCurrentAcademicYear();
    const batchIds = await Batch.find({ academicYear }).distinct('_id');
    const syllabus = await Syllabus.find({ batch: { $in: batchIds } }).populate('batch').lean();
    res.json({ syllabus });
  } catch (err) {
    res.status(500).json({ error: 'Error loading syllabus' });
  }
});

// ========== STUDY MATERIALS ==========
router.get('/materials', async (req, res) => {
  try {
    const academicYear = req.query.year || calculateCurrentAcademicYear();
    const batchIds = await Batch.find({ academicYear }).distinct('_id');
    const materials = await StudyMaterial.find({ batch: { $in: batchIds } }).populate('batch').sort({ createdAt: -1 }).lean();
    res.json({ materials });
  } catch (err) {
    res.status(500).json({ error: 'Error loading materials' });
  }
});

// ========== REPORTS ==========
router.get('/reports/revenue', async (req, res) => {
  try {
    const academicYear = req.query.year || calculateCurrentAcademicYear();
    const batchIds = await Batch.find({ academicYear }).distinct('_id');
    const months = ['May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March', 'April'];
    const fees = await Fee.find({ status: 'Paid', batch: { $in: batchIds } }).populate('batch').lean();

    const monthlyRevenue = {};
    const methodStats = { Cash: 0, UPI: 0, Razorpay: 0 };
    let totalRevenue = 0;
    months.forEach((m) => { monthlyRevenue[m] = 0; });
    fees.forEach((fee) => {
      if (monthlyRevenue[fee.month] !== undefined) monthlyRevenue[fee.month] += fee.amount;
      if (methodStats[fee.method] !== undefined) methodStats[fee.method]++;
      totalRevenue += fee.amount;
    });

    res.json({ monthlyRevenue, totalRevenue, paymentCount: fees.length, methodStats });
  } catch (err) {
    res.status(500).json({ error: 'Error loading revenue report' });
  }
});

router.get('/reports/audit', async (req, res) => {
  try {
    const academicYear = req.query.year || calculateCurrentAcademicYear();
    const logs = await AuditLog.find({ academicYear }).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: 'Error loading audit logs' });
  }
});

module.exports = router;
