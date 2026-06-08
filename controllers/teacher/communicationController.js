const EmailLog = require("../../models/EmailLog");

exports.renderCommunicationLogs = async (req, res) => {
  try {
    const { viewingYear, currentAcademicYear } = req;
    const filter = viewingYear ? { academicYear: viewingYear } : {};
    
    // Allow optional filtering by emailType
    if (req.query.type) {
      filter.emailType = req.query.type;
    }
    
    const logs = await EmailLog.find(filter)
      .populate("studentRef", "studentName email")
      .sort({ createdAt: -1 })
      .limit(200); // Limit to last 200 for performance

    res.render("teacher/communication_logs", {
      logs,
      viewingYear,
      currentAcademicYear,
      queryType: req.query.type || ""
    });
  } catch (error) {
    console.error("Error fetching communication logs:", error);
    res.status(500).send("Server Error");
  }
};
