const Teacher = require("../../models/Teacher");
const Batch = require("../../models/Batch");
const User = require("../../models/User");
const Test = require("../../models/Test");
const Fee = require("../../models/Fee");
const AuditLog = require("../../models/AuditLog");
const { logAudit } = require("../../utils/auditService");
const bcrypt = require("bcrypt");
const { renderError } = require("../../utils/renderError");

exports.renderLogin = (req, res) => {
  res.render("teacher/login", { hideNavbar: true });
};

exports.processLogin = async (req, res) => {
  try {
    const { teacherId, password } = req.body;
    const teacher = await Teacher.findOne({ teacherId }).select('+password');

    if (!teacher) {
      return res.render("teacher/login", { error: "Invalid ID or password", hideNavbar: true });
    }

    const validPassword = await bcrypt.compare(password, teacher.password);
    if (validPassword) {
      req.session.userId = teacher._id;
      req.session.userName = teacher.teacherName;
      req.session.userIdString = teacher.teacherId;
      req.session.role = teacher.role || "teacher";

      if (!req.body.rememberMe) {
        req.session.cookie.expires = false; // Becomes a session cookie
      }
      
      await logAudit(req, {
        action: "LOGIN",
        entityType: "Teacher",
        entityId: teacher._id,
        details: "Teacher logged in successfully",
        academicYear: req.currentAcademicYear || "N/A"
      });
      
      return res.redirect("/teacher/dashboard");
    } else {
      return res.render("teacher/login", { error: "Invalid ID or password", hideNavbar: true });
    }
  } catch (err) {
    console.error("Login error:", err);
    res.render("teacher/login", { error: "Server error. Try again." });
  }
};

exports.renderDashboard = async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.session.userId);
    if (!teacher) return res.redirect("/teacher/login");

    const academicYear = req.viewingYear;

    const yearBatches = await Batch.find({ academicYear }).distinct('_id');
    const [
      totalStudents,
      upcomingTestsCount,
      revenueAggregation,
      upcomingTests,
      recentPayments,
      recentAudits,
      activeBatches,
    ] = await Promise.all([
      User.countDocuments({ batch: { $in: yearBatches } }),
      Test.countDocuments({ batch: { $in: yearBatches }, testDate: { $gte: new Date() } }),
      Fee.aggregate([
        { $match: { batch: { $in: yearBatches }, status: 'Paid' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Test.find({ batch: { $in: yearBatches }, testDate: { $gte: new Date() } })
        .populate('batch')
        .sort({ testDate: 1 })
        .limit(3)
        .lean(),
      Fee.find({ batch: { $in: yearBatches }, status: 'Paid' })
        .populate('batch')
        .sort({ datePaid: -1 })
        .limit(4)
        .lean(),
      AuditLog.find({ academicYear })
        .sort({ createdAt: -1 })
        .limit(4)
        .lean(),
      Batch.find({ academicYear, isActive: true }).lean(),
    ]);

    const totalRevenue = revenueAggregation.length > 0 ? revenueAggregation[0].total : 0;

    // Calculate dynamic student count per active batch
    const batchCounts = await Promise.all(
      activeBatches.map(async (b) => {
        const count = await User.countDocuments({ batch: b._id });
        return { name: b.name, count };
      })
    );
    batchCounts.sort((a, b) => b.count - a.count);

    res.render("teacher/dashboard", {
      teacher,
      metrics: {
        totalStudents,
        upcomingTests: upcomingTestsCount,
        totalRevenue
      },
      upcomingTests,
      recentPayments,
      recentAudits,
      batchCounts,
      viewingYear: academicYear,
    });
  } catch (err) {
    console.error("Teacher dashboard error:", err);
    renderError(req, res, 500, "Error loading dashboard");
  }
};

exports.processLogout = async (req, res) => {
  if (req.session.userId) {
    await logAudit(req, {
      action: "LOGOUT",
      entityType: "Teacher",
      details: "Teacher logged out",
      academicYear: req.currentAcademicYear || "N/A"
    });
  }
  
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout error:", err);
      return renderError(req, res, 500, "Logout failed");
    }
    res.redirect("/");
  });
};

exports.renderAddTeacher = (req, res) => {
  res.render("teacher/add_teacher");
};

exports.processAddTeacher = async (req, res) => {
  try {
    const { teacherId, teacherName, email, subjects, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 12);

    const newTeacher = new Teacher({
      teacherId,
      teacherName,
      email,
      subjects,
      password: hashedPassword,
    });
    await newTeacher.save();
    
    await logAudit(req, {
      action: "CREATE",
      entityType: "Teacher",
      entityId: newTeacher._id,
      details: `Added new teacher: ${teacherName}`,
      academicYear: req.currentAcademicYear || "N/A"
    });
    
    res.redirect("/teacher/dashboard");
  } catch (err) {
    console.error(err);
    if (err.code === 11000) renderError(req, res, 400, "Teacher ID already exists");
    else renderError(req, res, 500, "Failed to add teacher");
  }
};

exports.renderEditTeacher = async (req, res) => {
  try {
    if (!require('mongoose').Types.ObjectId.isValid(req.params.id)) return renderError(req, res, 404, "Teacher not found");
    const teacher = await Teacher.findById(req.params.id).lean();
    if (!teacher) return renderError(req, res, 404, "Teacher not found");
    res.render("teacher/edit_teacher", { teacher });
  } catch (err) {
    console.error(err);
    renderError(req, res, 500, "Error loading teacher");
  }
};

exports.processEditTeacher = async (req, res) => {
  try {
    const { teacherName, email, subjects, password } = req.body;
    const updateData = { teacherName, email, subjects };
    let pwdChanged = false;
    
    if (password && password.trim() !== "") {
      updateData.password = await bcrypt.hash(password, 12);
      pwdChanged = true;
    }
    
    if (!require('mongoose').Types.ObjectId.isValid(req.params.id)) return renderError(req, res, 404, "Teacher not found");
    await Teacher.findByIdAndUpdate(req.params.id, updateData);
    
    await logAudit(req, {
      action: "UPDATE",
      entityType: "Teacher",
      entityId: req.params.id,
      details: `Updated teacher profile for ${teacherName}`,
      academicYear: req.currentAcademicYear || "N/A"
    });
    
    if (pwdChanged) {
      await logAudit(req, {
        action: "PASSWORD_CHANGE",
        entityType: "Teacher",
        entityId: req.params.id,
        details: `Password changed for teacher ${teacherName}`,
        academicYear: req.currentAcademicYear || "N/A"
      });
    }
    
    res.redirect(`/teacher/edit_teacher/${req.params.id}`);
  } catch (err) {
    console.error(err);
    renderError(req, res, 500, "Error updating teacher");
  }
};
