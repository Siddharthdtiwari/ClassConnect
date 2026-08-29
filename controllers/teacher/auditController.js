const AuditLog = require("../../models/AuditLog");
const EmailLog = require("../../models/EmailLog");
const { renderError } = require("../../utils/renderError");

// Single source for everything that happens in the system — administrative actions
// (including payments, which are logged via logAudit against the Fee entity) and
// outbound emails, normalized into one shape and merged into one timeline.
function normalizeAudit(entry) {
  const detailsLower = (entry.details || "").toLowerCase();
  const failed = detailsLower.includes("failed");
  return {
    date: entry.createdAt,
    type: "Audit",
    label: entry.action,
    entity: entry.entityType,
    details: entry.details,
    actor: entry.performedBy || "System",
    actorRole: entry.userRole || "System",
    status: failed ? "Failed" : "Success",
  };
}

function normalizeEmail(entry) {
  return {
    date: entry.createdAt,
    type: "Email",
    label: entry.emailType,
    entity: "Email",
    details: `${entry.subject} → ${entry.to}`,
    actor: entry.studentRef ? entry.studentRef.studentName : entry.to,
    actorRole: entry.studentRef ? "Student" : "—",
    status: entry.status, // "Sent" | "Failed"
    // "Sent" here only means the SMTP handshake accepted it — kept in the tooltip.
    note: entry.status === "Failed" ? entry.errorMessage : "SMTP accepted the message; not proof of inbox delivery.",
  };
}

exports.renderAuditTrail = async (req, res) => {
  try {
    const { viewingYear, currentAcademicYear } = req;
    const type = req.query.type === "Audit" || req.query.type === "Email" ? req.query.type : "";
    const status = req.query.status === "Success" || req.query.status === "Failed" ? req.query.status : "";
    const q = (req.query.q || "").trim();
    const safeQ = q ? q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "";
    const re = safeQ ? new RegExp(safeQ, "i") : null;

    const auditFilter = viewingYear ? { academicYear: viewingYear } : {};
    const emailFilter = viewingYear ? { academicYear: viewingYear } : {};
    if (re) {
      auditFilter.$or = [{ details: re }, { performedBy: re }, { action: re }, { entityType: re }];
      emailFilter.$or = [{ to: re }, { subject: re }];
    }

    const [auditEntries, emailEntries] = await Promise.all([
      type === "Email" ? [] : AuditLog.find(auditFilter).sort({ createdAt: -1 }).limit(200).lean(),
      type === "Audit" ? [] : EmailLog.find(emailFilter).populate("studentRef", "studentName").sort({ createdAt: -1 }).limit(200).lean(),
    ]);

    let logs = [
      ...auditEntries.map(normalizeAudit),
      ...emailEntries.map(normalizeEmail),
    ];

    if (status) {
      logs = logs.filter((l) => l.status === status);
    }

    logs.sort((a, b) => new Date(b.date) - new Date(a.date));
    logs = logs.slice(0, 250);

    res.render("teacher/audit_trail", {
      logs,
      viewingYear,
      currentAcademicYear,
      queryType: type,
      queryStatus: status,
      queryQ: q,
    });
  } catch (error) {
    console.error("Error fetching audit trail:", error);
    renderError(req, res, 500, "Server Error");
  }
};
