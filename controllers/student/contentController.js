const User = require("../../models/User");
const StudyMaterial = require("../../models/StudyMaterial");
const Test = require("../../models/Test");

exports.renderContent = async (req, res) => {
  try {
    const student = await User.findById(req.session.userId).populate('batch').lean();
    if (!student) return res.redirect("/student/login");

    const studentBatchId = student.batch ? student.batch._id : null;
    if (!studentBatchId) {
      return res.render("student/content", { student, materials: [], tests: [], success: null, error: "No batch assigned to your profile." });
    }

    const materials = await StudyMaterial.find({ batch: studentBatchId }).lean();
    const tests = await Test.find({ batch: studentBatchId }).lean();

    res.render("student/content", { student, materials, tests });
  } catch (err) {
    console.error("Error loading student content:", err);
    res.status(500).send("Error loading study materials");
  }
};
