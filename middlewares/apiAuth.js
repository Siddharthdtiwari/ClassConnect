const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Teacher = require('../models/Teacher');
const mongoose = require('mongoose');

// Helper to extract token from header
const getToken = (req) => {
  if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') {
    return req.headers.authorization.split(' ')[1];
  }
  return null;
};

// Middleware for student API routes
const requireStudentApiLogin = async (req, res, next) => {
  try {
    const token = getToken(req);
    if (!token) {
      return res.status(401).json({ error: 'No token provided. Please log in.' });
    }

    const decoded = jwt.verify(token, process.env.SESSION_SECRET);
    if (decoded.role !== 'student') {
      return res.status(403).json({ error: 'Access denied. Students only.' });
    }

    const student = await User.findById(decoded.id).populate('batch').lean();
    if (!student) {
      return res.status(401).json({ error: 'Invalid token. User not found.' });
    }
    if (student.isActive === false) {
      return res.status(403).json({ error: 'Account deactivated.' });
    }
    // Almost every endpoint here assumes a batch is assigned (fees, scores,
    // attendance, leaderboard...) and crashes deep inside a handler if it isn't —
    // catching it once here is far more reliable than guarding every call site.
    // Profile is exempt so the app can still show the account and let them log out.
    if (!student.batch && !req.path.includes('/profile')) {
      return res.status(400).json({ error: 'No batch has been assigned to your account yet. Please contact your teacher or admin.' });
    }

    req.user = student;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired. Please log in again.' });
    }
    return res.status(401).json({ error: 'Invalid token. Authentication failed.' });
  }
};

// Middleware for teacher API routes
const requireTeacherApiLogin = async (req, res, next) => {
  try {
    const token = getToken(req);
    if (!token) {
      return res.status(401).json({ error: 'No token provided. Please log in.' });
    }

    const decoded = jwt.verify(token, process.env.SESSION_SECRET);
    if (decoded.role !== 'teacher') {
      return res.status(403).json({ error: 'Access denied. Teachers only.' });
    }

    const teacher = await Teacher.findById(decoded.id).lean();
    if (!teacher) {
      return res.status(401).json({ error: 'Invalid token. User not found.' });
    }
    if (teacher.isActive === false) {
      return res.status(403).json({ error: 'Account deactivated.' });
    }

    req.teacher = teacher;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired. Please log in again.' });
    }
    return res.status(401).json({ error: 'Invalid token. Authentication failed.' });
  }
};

module.exports = {
  requireStudentApiLogin,
  requireTeacherApiLogin
};
