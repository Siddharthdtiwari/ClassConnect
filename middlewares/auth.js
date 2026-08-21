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
  if (!req.session.userId || !['teacher', 'admin', 'owner'].includes(req.session.role))
    return res.redirect("/teacher/login");

  try {
    const teacher = await Teacher.findById(req.session.userId).lean();
    if (!teacher) return res.redirect("/teacher/login");

    req.teacher = teacher;
    res.locals.teacher = teacher;
    res.locals.userRole = req.session.role;
    next();
  } catch (err) {
    console.error("Middleware error:", err);
    res.redirect("/teacher/login");
  }
};

// A visitor who already has a live session has no reason to see a login form again.
// Scoped to one portal so a logged-in student hitting /teacher/login still gets the
// form (they may be switching accounts). The existence check keeps a stale session
// pointing at a deleted account from bouncing between here and requireXLogin.
const redirectIfLoggedIn = (portal) => async (req, res, next) => {
  const role = req.session?.role;
  if (!req.session?.userId || !role) return next();

  const isTeacherPortal = portal === "teacher";
  const matchesPortal = isTeacherPortal
    ? ['teacher', 'admin', 'owner'].includes(role)
    : role === "student";
  if (!matchesPortal) return next();

  try {
    const model = isTeacherPortal ? Teacher : User;
    const exists = await model.exists({ _id: req.session.userId });
    if (exists) return res.redirect(`/${portal}/dashboard`);
  } catch (err) {
    console.error("redirectIfLoggedIn error:", err);
    return next();
  }

  // Session references an account that no longer exists — drop it and show the form.
  return req.session.destroy(() => next());
};

const requireAdminOrOwner = (req, res, next) => {
  if (['admin', 'owner'].includes(req.session.role)) {
    return next();
  }
  res.status(403).send("Access Denied: You do not have permission to view this page.");
};

const requireAdminOnly = (req, res, next) => {
  if (req.session.role === 'admin') {
    return next();
  }
  res.status(403).send("Access Denied: This feature is restricted to Administrators only.");
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
  redirectIfLoggedIn,
  requireAdminOrOwner,
  requireAdminOnly,
  requireStudentLogin
};
