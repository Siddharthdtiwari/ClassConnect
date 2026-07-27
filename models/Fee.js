const mongoose = require("mongoose");
const { ACADEMIC_MONTHS } = require("../utils/constants");

const feeSchema = new mongoose.Schema(
  {
    studentId: {
      type: String,
      required: true,
    },
    studentName: { type: String, required: true },
    studentEmail: { type: String, trim: true, lowercase: true },
    userRef: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Batch",
      required: true,
    },
    month: {
      type: String,
      required: true,
      enum: ACADEMIC_MONTHS,
    },
    year: { type: Number, required: true },
    amount: { type: Number, required: true, min: 0 },
    method: { type: String, enum: ["Cash", "UPI", "Razorpay"] },
    // "NA" = month does not apply to this student (joined mid-year / on a break).
    status: {
      type: String,
      enum: ["Paid", "Failed", "Pending", "NA"],
      default: "Pending",
    },
    // Why this month doesn't apply — only set on "NA" rows.
    naReason: { type: String, trim: true, maxlength: 120 },
    receiptNo: {
      type: String,
      unique: true,
      sparse: true,
    },
    razorpay_payment_id: { type: String },
    datePaid: { type: Date },
  },
  { timestamps: true }
);

// Pre-save hook: generate receiptNo if status is "Paid" and receiptNo is missing
feeSchema.pre("save", async function (next) {
  try {
    if (this.status === "Paid" && !this.receiptNo) {
      // Find the Batch first to get its academicYear
      const batchDetails = await mongoose.model("Batch").findById(this.batch);
      const accYear = batchDetails ? batchDetails.academicYear : "UNKNOWN";
        
      // Use the last 8 characters of the unique MongoDB ObjectId to prevent race conditions
      const uniqueSuffix = this._id.toString().slice(-8).toUpperCase();
      this.receiptNo = `RCP-${accYear}-${uniqueSuffix}`;
    }
    next();
  } catch (err) {
    next(err);
  }
});

feeSchema.index({ studentId: 1, month: 1, year: 1, batch: 1 }, { unique: true });
feeSchema.index({ studentId: 1, batch: 1 });
feeSchema.index({ status: 1, batch: 1 });

module.exports = mongoose.model("Fee", feeSchema);
