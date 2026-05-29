const mongoose = require("mongoose");

const teacherSchema = new mongoose.Schema(
  {
    teacherId: { type: String, required: true, unique: true },
    teacherName: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      match: /.+\@.+\..+/,
      lowercase: true,
      trim: true,
      unique: true,
    },
    phone: { type: String, trim: true },
    subjects: {
      type: [String],
      required: true,
      minlength: 1,
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: "Teacher must teach at least one subject",
      },
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Teacher", teacherSchema);
