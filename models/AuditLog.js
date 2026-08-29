const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ["CREATE", "UPDATE", "DELETE", "REPOST", "BULK_UPDATE", "LOGIN", "LOGOUT", "PASSWORD_CHANGE", "DOWNLOAD", "EXPORT", "SYSTEM_ACTION"],
      required: true,
    },
    entityType: {
      type: String,
      enum: ["User", "Teacher", "Fee", "Batch", "Test", "Attendance", "StudyMaterial", "Score", "Syllabus"],
      required: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    details: {
      type: String,
      required: true,
    },
    academicYear: {
      type: String,
      required: true,
    },
    performedBy: {
      type: String,
      default: "Teacher/Admin",
    },
    performedById: {
      type: String,
      default: "Unknown",
    },
    userRole: {
      type: String,
      enum: ["Teacher", "Admin", "Owner", "Student", "System"],
      default: "System",
    }
  },
  { timestamps: true }
);

auditLogSchema.index({ academicYear: 1 });
auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
