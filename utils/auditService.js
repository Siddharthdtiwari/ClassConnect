const AuditLog = require("../models/AuditLog");

/**
 * Logs an action to the AuditTrail
 * @param {Object} req The Express request object containing session data
 * @param {Object} options
 * @param {String} options.action CREATE, UPDATE, DELETE, REPOST, BULK_UPDATE
 * @param {String} options.entityType User, Fee, Batch, Test, Attendance, StudyMaterial, Score
 * @param {String|mongoose.Types.ObjectId} [options.entityId] Optional entity ID
 * @param {String} options.details Description of the action
 * @param {String} options.academicYear The active academic year
 */
const logAudit = async (req, { action, entityType, entityId, details, academicYear }) => {
  try {
    if (!academicYear) {
      console.warn("Audit Log missing academicYear. Skipping.");
      return;
    }

    let performedBy = "System";
    let performedById = "Unknown";
    let userRole = "System";

    if (req && req.session) {
      if (['teacher', 'admin', 'owner'].includes(req.session.role)) {
        userRole = req.session.role.charAt(0).toUpperCase() + req.session.role.slice(1);
        performedBy = req.session.userName || "Teacher/Admin";
        performedById = req.session.userIdString || "Unknown";
      } else if (req.session.role === "student") {
        userRole = "Student";
        performedBy = req.session.userName || "Student";
        performedById = req.session.userIdString || "Unknown";
      }
    }
    
    await AuditLog.create({
      action,
      entityType,
      entityId,
      details,
      academicYear,
      performedBy,
      performedById,
      userRole
    });
  } catch (error) {
    console.error("Failed to save audit log:", error);
  }
};

module.exports = { logAudit };
