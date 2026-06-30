const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

const User = require('../../models/User');
const Teacher = require('../../models/Teacher');
const Batch = require('../../models/Batch');

const JWT_SECRET = process.env.SESSION_SECRET || 'secret';

// Helper to generate token
const generateToken = (user, role) => {
  return jwt.sign(
    { id: user._id, role: role },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
};

// Student Login API
router.post('/student/login', async (req, res) => {
  try {
    const { studentId, password } = req.body;

    let targetStudentId = studentId;
    let targetAcademicYear = req.currentAcademicYear || '2026-27'; // fallback just in case

    // Cheat code: THEC1012526 -> THEC101 and 2025-26
    const cheatMatch = studentId.match(/^([a-zA-Z]+[0-9]+)([0-9]{4})$/);
    if (cheatMatch) {
      targetStudentId = cheatMatch[1];
      const yearPart = cheatMatch[2];
      const startYear = "20" + yearPart.substring(0, 2);
      const endYear = yearPart.substring(2, 4);
      targetAcademicYear = `${startYear}-${endYear}`;
    }

    const activeBatches = await Batch.find({ academicYear: targetAcademicYear }).distinct('_id');

    const student = await User.findOne({
      studentId: targetStudentId,
      batch: { $in: activeBatches }
    }).select('+password').populate('batch');

    if (!student) {
      return res.status(401).json({ error: 'Invalid ID or password' });
    }

    const validPassword = await bcrypt.compare(password, student.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid ID or password' });
    }

    const token = generateToken(student, 'student');

    res.json({
      token,
      user: {
        id: student._id,
        name: student.studentName,
        studentId: student.studentId,
        role: 'student',
        batch: student.batch
      }
    });

  } catch (err) {
    console.error('Student API login error:', err);
    res.status(500).json({ error: 'Server error. Try again.' });
  }
});

// Teacher Login API
router.post('/teacher/login', async (req, res) => {
  try {
    const { teacherId, password } = req.body;

    const teacher = await Teacher.findOne({ teacherId }).select('+password');
    if (!teacher) {
      return res.status(401).json({ error: 'Invalid ID or password' });
    }

    const validPassword = await bcrypt.compare(password, teacher.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid ID or password' });
    }

    const token = generateToken(teacher, 'teacher');

    res.json({
      token,
      user: {
        id: teacher._id,
        name: teacher.teacherName,
        teacherId: teacher.teacherId,
        role: 'teacher'
      }
    });

  } catch (err) {
    console.error('Teacher API login error:', err);
    res.status(500).json({ error: 'Server error. Try again.' });
  }
});

module.exports = router;
