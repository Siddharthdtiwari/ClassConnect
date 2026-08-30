const User = require("../../models/User");
const { uploadToCloudinary } = require("../../utils/upload");
const { logAudit } = require("../../utils/auditService");
const { renderError } = require("../../utils/renderError");

exports.renderEditProfile = async (req, res) => {
  try {
    const student = await User.findById(req.session.userId).populate('batch').lean();
    if (!student) return res.redirect("/student/login");

    res.render("student/edit_profile", { student });
  } catch (err) {
    console.error(err);
    renderError(req, res, 500, "Error loading edit profile page");
  }
};

exports.processEditProfile = async (req, res) => {
  try {
    const updates = {
      studentName: req.body.studentName,
      mobileNo: req.body.mobileNo,
      email: req.body.email,
    };

    if (req.file) {
      const result = await uploadToCloudinary(
        req.file.buffer,
        "student-profiles"
      );
      updates.profilePhoto = result.secure_url;
    }

    await User.findByIdAndUpdate(req.session.userId, updates, { new: true });
    
    await logAudit(req, {
      action: "UPDATE",
      entityType: "User",
      entityId: req.session.userId,
      details: "Student updated their profile",
      academicYear: req.currentAcademicYear || "N/A"
    });
    
    res.redirect("/student/dashboard");
  } catch (err) {
    console.error(err);
    renderError(req, res, 500, "Error updating profile");
  }
};
