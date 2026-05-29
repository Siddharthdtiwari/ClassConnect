const Teacher = require("../../models/Teacher");
const Batch = require("../../models/Batch");
const User = require("../../models/User");
const Test = require("../../models/Test");
const Fee = require("../../models/Fee");
const bcrypt = require("bcrypt");

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
      req.session.role = "teacher";
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
    const [totalStudents, upcomingTests, revenueAggregation] = await Promise.all([
      User.countDocuments({ batch: { $in: yearBatches } }),
      Test.countDocuments({ batch: { $in: yearBatches }, testDate: { $gte: new Date() } }),
      Fee.aggregate([
        { $match: { batch: { $in: yearBatches }, status: 'Paid' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);
    
    const totalRevenue = revenueAggregation.length > 0 ? revenueAggregation[0].total : 0;

    res.render("teacher/dashboard", { 
      teacher,
      metrics: {
        totalStudents,
        upcomingTests,
        totalRevenue
      }
    });
  } catch (err) {
    console.error("Teacher dashboard error:", err);
    res.status(500).send("Error loading dashboard");
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
    res.redirect("/teacher/dashboard");
  } catch (err) {
    console.error(err);
    if (err.code === 11000) res.status(400).send("Teacher ID already exists");
    else res.status(500).send("Failed to add teacher");
  }
};

exports.renderEditTeacher = async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.params.id).lean();
    if (!teacher) return res.status(404).send("Teacher not found");
    res.render("teacher/edit_teacher", { teacher });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading teacher");
  }
};

exports.processEditTeacher = async (req, res) => {
  try {
    const { teacherName, email, subjects, password } = req.body;
    const updateData = { teacherName, email, subjects };
    if (password && password.trim() !== "") {
      updateData.password = await bcrypt.hash(password, 12);
    }
    await Teacher.findByIdAndUpdate(req.params.id, updateData);
    res.redirect(`/teacher/edit_teacher/${req.params.id}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating teacher");
  }
};
