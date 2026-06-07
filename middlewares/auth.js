const mongoose = require("mongoose");
const User = require("../models/User");
const Teacher = require("../models/Teacher");

async function connectDB() {
  if ([1, 2].includes(mongoose.connection.readyState)) return;
  const options = { serverSelectionTimeoutMS: 5000 };
  try {
    await mongoose.connect(process.env.MONGODB_URI, options);
    console.log("MongoDB connection established.");
  } catch (err) {
    console.error("MongoDB Connection Error:", err);
    throw err;
  }
}

const ensureDBConnection = async (req, res, next) => {
  if ([1, 2].includes(mongoose.connection.readyState)) return next();
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error("Failed to establish DB connection for request:", err);
    res.status(503).send("Service Unavailable: Database Connection Error.");
  }
};

const requireTeacherLogin = async (req, res, next) => {
  if (!req.session.userId || req.session.role !== "teacher")
    return res.redirect("/teacher/login");

  try {
    const teacher = await Teacher.findById(req.session.userId).lean();
    if (!teacher) return res.redirect("/teacher/login");

    req.teacher = teacher;
    res.locals.teacher = teacher;
    next();
  } catch (err) {
    console.error("Middleware error:", err);
    res.redirect("/teacher/login");
  }
};

const requireStudentLogin = async (req, res, next) => {
  if (!req.session.userId || req.session.role !== "student")
    return res.redirect("/student/login");

  try {
    const student = await User.findById(req.session.userId).populate('batch').lean();
    if (!student) return res.redirect("/student/login");

    req.user = student;
    next();
  } catch (err) {
    console.error("Middleware error:", err);
    res.redirect("/student/login");
  }
};

module.exports = {
  connectDB,
  ensureDBConnection,
  requireTeacherLogin,
  requireStudentLogin
};
