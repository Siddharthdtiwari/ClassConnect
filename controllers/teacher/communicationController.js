const EmailLog = require("../../models/EmailLog");
const { renderError } = require("../../utils/renderError");

exports.renderCommunicationLogs = async (req, res) => {
  try {
    const { viewingYear, currentAcademicYear } = req;
    const filter = viewingYear ? { academicYear: viewingYear } : {};

    if (req.query.type) {
      filter.emailType = req.query.type;
    }
    if (req.query.status === "Sent" || req.query.status === "Failed") {
      filter.status = req.query.status;
    }
    // Search by recipient address or student name (case-insensitive, partial match).
    const q = (req.query.q || "").trim();
    if (q) {
      const safeQ = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(safeQ, "i");
      const User = require("../../models/User");
      const matchingStudentIds = await User.find({ studentName: re }).select("_id").lean();
      filter.$or = [
        { to: re },
        { studentRef: { $in: matchingStudentIds.map((s) => s._id) } },
      ];
    }

    const logs = await EmailLog.find(filter)
      .populate("studentRef", "studentName email")
      .sort({ createdAt: -1 })
      .limit(200); // Limit to last 200 for performance

    // Flag rows that share the same recipient + subject — a cheap signal for
    // possible duplicate sends, surfaced directly in the log instead of making
    // the teacher hunt for them by eye.
    const seenKeys = {};
    logs.forEach((log) => {
      const key = `${log.to}|${log.subject}`;
      seenKeys[key] = (seenKeys[key] || 0) + 1;
    });
    const logsWithDupFlag = logs.map((log) => {
      const key = `${log.to}|${log.subject}`;
      return { log, isDuplicate: seenKeys[key] > 1 };
    });

    res.render("teacher/communication_logs", {
      logsWithDupFlag,
      viewingYear,
      currentAcademicYear,
      queryType: req.query.type || "",
      queryStatus: req.query.status || "",
      queryQ: q
    });
  } catch (error) {
    console.error("Error fetching communication logs:", error);
    renderError(req, res, 500, "Server Error");
  }
};
