const AuditLog = require("../../models/AuditLog");

exports.renderAuditTrail = async (req, res) => {
  try {
    const { viewingYear, currentAcademicYear } = req;
    const filter = viewingYear ? { academicYear: viewingYear } : {};
    
    // Optional filtering by action type or entity type
    if (req.query.action) {
      filter.action = req.query.action;
    }
    if (req.query.entity) {
      filter.entityType = req.query.entity;
    }
    
    const logs = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(300); // Limit to last 300 for performance

    res.render("teacher/audit_trail", {
      logs,
      viewingYear,
      currentAcademicYear,
      queryAction: req.query.action || "",
      queryEntity: req.query.entity || ""
    });
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    res.status(500).send("Server Error");
  }
};
