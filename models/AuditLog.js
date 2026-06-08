const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ["CREATE", "UPDATE", "DELETE", "REPOST", "BULK_UPDATE"],
      required: true,
    },
    entityType: {
      type: String,
      enum: ["User", "Fee", "Batch", "Test", "Attendance", "StudyMaterial", "Score"],
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
    }
  },
  { timestamps: true }
);

auditLogSchema.index({ academicYear: 1 });
auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
