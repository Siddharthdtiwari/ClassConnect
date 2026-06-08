const AuditLog = require("../models/AuditLog");

/**
 * Logs an action to the AuditTrail
 * @param {Object} options
 * @param {String} options.action CREATE, UPDATE, DELETE, REPOST, BULK_UPDATE
 * @param {String} options.entityType User, Fee, Batch, Test, Attendance, StudyMaterial, Score
 * @param {String|mongoose.Types.ObjectId} [options.entityId] Optional entity ID
 * @param {String} options.details Description of the action
 * @param {String} options.academicYear The active academic year
 * @param {String} [options.performedBy="Teacher/Admin"] User who performed the action
 */
const logAudit = async ({ action, entityType, entityId, details, academicYear, performedBy = "Teacher/Admin" }) => {
  try {
    if (!academicYear) {
      console.warn("Audit Log missing academicYear. Skipping.");
      return;
    }
    
    await AuditLog.create({
      action,
      entityType,
      entityId,
      details,
      academicYear,
      performedBy
    });
  } catch (error) {
    console.error("Failed to save audit log:", error);
  }
};

module.exports = { logAudit };
