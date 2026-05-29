const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const User = require("../../models/User");

exports.renderLogin = (req, res) => res.render("student/login", { hideNavbar: true });

exports.processLogin = async (req, res) => {
  try {
    const { studentId, password } = req.body;
    let targetStudentId = studentId;
    let targetAcademicYear = req.currentAcademicYear;

    // Cheat code: THEC1012526 -> THEC101 and 2025-26
    const cheatMatch = studentId.match(/^([a-zA-Z]+[0-9]+)([0-9]{4})$/);
    if (cheatMatch) {
      targetStudentId = cheatMatch[1];
      const yearPart = cheatMatch[2];
      const startYear = "20" + yearPart.substring(0, 2);
      const endYear = yearPart.substring(2, 4);
      targetAcademicYear = `${startYear}-${endYear}`;
    }
    
    // Optimize: fetch batch IDs first
    const activeBatches = await mongoose.model('Batch').find({ academicYear: targetAcademicYear }).distinct('_id');
    
    const student = await User.findOne({ 
      studentId: targetStudentId, 
      batch: { $in: activeBatches } 
    }).select('+password');
    
    if (!student)
      return res.render("student/login", { error: "Invalid ID or password", hideNavbar: true });

    const validPassword = await bcrypt.compare(password, student.password);
    if (validPassword) {
      req.session.userId = student._id;
      req.session.role = "student";
      res.redirect("/student/dashboard");
    } else {
      res.render("student/login", { error: "Invalid ID or password", hideNavbar: true });
    }
  } catch (err) {
    console.error("Login error:", err);
    res.render("student/login", { error: "Server error. Try again.", hideNavbar: true });
  }
};

exports.processLogout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout error:", err);
      return res.status(500).send("Logout failed");
    }
    res.redirect("/");
  });
};
