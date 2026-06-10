const User = require("../../models/User");
const Batch = require("../../models/Batch");
const Fee = require("../../models/Fee");
const Score = require("../../models/Score");
const Attendance = require("../../models/Attendance");
const bcrypt = require("bcrypt");
const archiver = require("archiver");
const PDFDocument = require("pdfkit");
const { uploadToCloudinary } = require("../../utils/upload");
const { generateStudentReportPDF, drawStudentReport, generateStudentDirectoryPDF } = require("../../utils/pdfUtils");
const { sortStudentsByBatchAndId, sortBatches } = require("../../utils/sortHelpers");
const { logAudit } = require("../../utils/auditService");

exports.renderManageStudents = async (req, res) => {
  try {
    const batches = await Batch.find({ academicYear: req.viewingYear }).lean();
    batches.sort(sortBatches);

    const students = await User.find({ batch: { $in: req.viewingBatches } })
      .populate('batch')
      .lean();

    students.sort(sortStudentsByBatchAndId);

    res.render("teacher/manage_students", { students, batches });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading students");
  }
};

exports.renderAddStudent = async (req, res) => {
  res.redirect("/teacher/manage_students?action=add");
};

exports.processAddStudent = async (req, res) => {
  try {
    const {
      batchId,
      studentId,
      studentName,
      email,
      password,
      mobileNo,
      monthlyFee,
    } = req.body;
    const hashedPassword = await bcrypt.hash(password, 12);

    let profilePhotoUrl = null;
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, "student-profiles");
      profilePhotoUrl = result.secure_url;
    }

    const newStudent = new User({
      batch: batchId,
      studentId,
      studentName,
      email,
      password: hashedPassword,
      mobileNo,
      monthlyFee,
      profilePhoto: profilePhotoUrl,
    });
    await newStudent.save();
    await logAudit({
      action: "CREATE",
      entityType: "User",
      entityId: newStudent._id,
      details: `Added new student: ${studentName} (${studentId})`,
      academicYear: req.viewingYear
    });
    res.redirect("/teacher/manage_students");
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to add student");
  }
};

exports.renderEditProfile = async (req, res) => {
  try {
    const student = await User.findById(req.params.id).lean();
    if (!student) return res.status(404).send("Student not found");
    const batches = await Batch.find({ academicYear: req.viewingYear }).lean();
    batches.sort(sortBatches);
    res.render("teacher/edit_profile", { student, batches });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading student");
  }
};

exports.processEditProfile = async (req, res) => {
  try {
    const { studentName, batchId, mobileNo, monthlyFee, email } = req.body;
    const updateData = { studentName, batch: batchId, mobileNo, monthlyFee, email };

    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, "student-profiles");
      updateData.profilePhoto = result.secure_url;
    }

    await User.findByIdAndUpdate(req.params.id, updateData);
    await logAudit({
      action: "UPDATE",
      entityType: "User",
      entityId: req.params.id,
      details: `Updated student profile: ${studentName}`,
      academicYear: req.viewingYear
    });
    res.redirect(`/teacher/view_profile/${req.params.id}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating profile");
  }
};

exports.renderViewProfile = async (req, res) => {
  try {
    const student = await User.findById(req.params.id).populate('batch').lean();
    if (!student) return res.status(404).send("Student not found");

    const studentId = student.studentId;

    const recentFees = await Fee.find({ studentId: studentId, status: "Paid", batch: { $in: req.viewingBatches } })
      .populate('batch')
      .sort({ datePaid: -1 })
      .lean();

    const recentScores = await Score.find({ studentId: studentId, batch: { $in: req.viewingBatches } })
      .sort({ createdAt: -1 })
      .lean();

    const allAttendanceRecords = await Attendance.find({
      "records.studentId": studentId,
      batch: { $in: req.viewingBatches },
    }).lean();

    let presentDays = 0;
    let absentDays = 0;
    let totalDays = 0;

    allAttendanceRecords.forEach((dayRecord) => {
      totalDays++;
      const record = dayRecord.records.find((r) => r.studentId === studentId);
      if (record && record.status === "P") presentDays++;
      if (record && record.status === "A") absentDays++;
    });

    const attendancePercentage = totalDays > 0 ? ((presentDays / (presentDays + absentDays)) * 100).toFixed(1) : 0;

    const scoreLabels = recentScores.slice(0, 10).map((score) => score.testName).reverse();
    const scoreData = recentScores.slice(0, 10).map((score) => score.percentage).reverse();

    const allStudents = await User.find({ batch: { $in: req.viewingBatches } })
      .populate('batch')
      .sort({ points: -1 })
      .lean();

    let studentRank = "-";
    const rankIndex = allStudents.findIndex(s => s._id.toString() === student._id.toString());
    if (rankIndex !== -1) {
      studentRank = rankIndex + 1;
    }

    res.render("teacher/view_profile", {
      student,
      recentFees,
      recentScores,
      attendancePercentage,
      presentDays,
      absentDays,
      totalDays,
      scoreLabels,
      scoreData,
      studentRank,
    });
  } catch (err) {
    console.error("Error loading student profile:", err);
    res.status(500).send("Error loading student profile");
  }
};

exports.renderBulkAddStudents = async (req, res) => {
  try {
    const activeBatches = await Batch.find({ academicYear: req.viewingYear }).lean();
    const studentsRaw = await User.find({ batch: { $in: activeBatches.map(b => b._id) } }).populate('batch').lean();

    activeBatches.sort(sortBatches);
    studentsRaw.sort(sortStudentsByBatchAndId);

    res.render("teacher/bulk_add_students", { students: studentsRaw, batches: activeBatches });
  } catch (err) {
    console.error("Bulk add students GET error:", err);
    res.status(500).send("Error loading bulk add page");
  }
};

exports.processBulkSaveStudents = async (req, res) => {
  try {
    const studentsData = req.body;
    if (!Array.isArray(studentsData) || studentsData.length === 0) {
      return res.status(400).json({ error: "Invalid or empty data provided." });
    }

    const bulkOps = [];
    const errors = [];
    let processed = 0;

    const allStudentIds = studentsData.map(r => r.studentId).filter(Boolean);
    const existingStudents = await User.find({ studentId: { $in: allStudentIds }, batch: { $in: req.currentBatches } }).lean();
    const existingMap = new Set(existingStudents.map(s => String(s.studentId)));

    await Promise.all(studentsData.map(async (row, i) => {
      if (!row.studentName || !row.studentId || !row.batchId || !row.mobileNo) {
        errors.push(`Row ${i + 1}: Missing required fields (Name, ID, Batch, or Mobile).`);
        return;
      }

      const updateDoc = {
        studentName: row.studentName,
        studentId: row.studentId,
        batch: row.batchId,
        mobileNo: row.mobileNo,
        monthlyFee: row.monthlyFee || 0,
        email: row.email || "",
      };

      if (row.password && String(row.password).trim() !== "") {
        updateDoc.password = await bcrypt.hash(String(row.password).trim(), 12);
      } else {
        if (!row.id && !existingMap.has(String(row.studentId))) {
          updateDoc.password = await bcrypt.hash(String(row.mobileNo).trim(), 12);
        }
      }

      const filter = row.id ? { _id: row.id } : { studentId: row.studentId, batch: row.batchId };

      bulkOps.push({
        updateOne: {
          filter,
          update: { $set: updateDoc },
          upsert: true
        }
      });
      processed++;
    }));

    if (bulkOps.length > 0) {
      await User.bulkWrite(bulkOps);
      await logAudit({
        action: "BULK_UPDATE",
        entityType: "User",
        details: `Bulk saved ${processed} student records.`,
        academicYear: req.viewingYear
      });
    }

    res.json({
      success: true,
      inserted: processed,
      errors: errors,
    });
  } catch (err) {
    console.error("Bulk Add Students Error:", err);
    res.status(500).json({ error: "Server error during bulk save." });
  }
};

exports.generateBulkStudentReports = async (req, res) => {
  try {
    const allStudentsData = await User.find({ batch: { $in: req.viewingBatches }, role: { $ne: "teacher" } })
      .populate('batch')
      .sort({ points: -1 })
      .lean();

    if (allStudentsData.length === 0) {
      return res.status(404).send("No students found in the selected batches.");
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", "attachment; filename=all-student-reports.zip");

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(res);

    const studentIds = allStudentsData.map(s => s.studentId);

    // Fetch all related data upfront to avoid N+1 queries
    const allFees = await Fee.find({ studentId: { $in: studentIds }, status: "Paid", batch: { $in: req.viewingBatches } })
      .populate('batch')
      .sort({ datePaid: 1 })
      .lean();

    const allScores = await Score.find({ studentId: { $in: studentIds }, batch: { $in: req.viewingBatches } })
      .populate("testId", "subject")
      .sort({ createdAt: 1 })
      .lean();

    const allAttendanceRecords = await Attendance.find({
      "records.studentId": { $in: studentIds },
      batch: { $in: req.viewingBatches },
    }).lean();

    // Group Fees
    const feesMap = {};
    allFees.forEach(fee => {
      if (!feesMap[fee.studentId]) feesMap[fee.studentId] = [];
      feesMap[fee.studentId].push(fee);
    });

    // Group Scores
    const scoresMap = {};
    allScores.forEach(score => {
      if (!scoresMap[score.studentId]) scoresMap[score.studentId] = [];
      scoresMap[score.studentId].push(score);
    });

    for (let i = 0; i < allStudentsData.length; i++) {
      const student = allStudentsData[i];
      const studentId = student.studentId;

      const recentFees = feesMap[studentId] || [];
      const recentScores = scoresMap[studentId] || [];

      let presentDays = 0;
      let absentDays = 0;
      let totalDays = 0;

      allAttendanceRecords.forEach((dayRecord) => {
        const record = dayRecord.records.find((r) => r.studentId === studentId);
        if (record) {
          totalDays++;
          if (record.status === "P") presentDays++;
          if (record.status === "A") absentDays++;
        }
      });

      const attendancePercentage = totalDays > 0 ? ((presentDays / (presentDays + absentDays)) * 100).toFixed(1) : 0;
      const studentRank = i + 1; // Since it's already sorted by points

      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 40, left: 40, right: 40, bottom: 0 },
        bufferPages: true
      });

      const safeName = `${(student.batch ? student.batch.name : 'Unknown')}-${student.studentName}-${student.studentId}`.replace(/[^a-zA-Z0-9- ]/g, "").replace(/\s+/g, "-");

      archive.append(doc, { name: `${safeName}.pdf` });
      await drawStudentReport(doc, student, {
        recentFees,
        recentScores,
        attendancePercentage,
        presentDays,
        absentDays,
        totalDays,
        studentRank,
      });
      doc.end();
    }

    await archive.finalize();
  } catch (err) {
    console.error("Error generating bulk student reports:", err);
    if (!res.headersSent) {
      res.status(500).send("Error generating bulk reports");
    }
  }
};

exports.generateStudentReport = async (req, res) => {
  try {
    const student = await User.findById(req.params.id).populate('batch').lean();
    if (!student) return res.status(404).send("Student not found");

    const studentId = student.studentId;

    const recentFees = await Fee.find({ studentId: studentId, status: "Paid", batch: student.batch._id })
      .populate('batch')
      .sort({ datePaid: 1 })
      .lean();

    const recentScores = await Score.find({ studentId: studentId, batch: student.batch._id })
      .populate("testId", "subject topic testDate")
      .sort({ createdAt: 1 })
      .lean();

    const allAttendanceRecords = await Attendance.find({
      "records.studentId": studentId,
      batch: student.batch._id,
    }).lean();

    let presentDays = 0;
    let absentDays = 0;
    let totalDays = 0;

    allAttendanceRecords.forEach((dayRecord) => {
      totalDays++;
      const record = dayRecord.records.find((r) => r.studentId === studentId);
      if (record && record.status === "P") presentDays++;
      if (record && record.status === "A") absentDays++;
    });

    const attendancePercentage = totalDays > 0 ? ((presentDays / (presentDays + absentDays)) * 100).toFixed(1) : 0;

    const allStudents = await User.find({ batch: student.batch._id })
      .populate('batch')
      .sort({ points: -1 })
      .lean();

    let studentRank = "-";
    const rankIndex = allStudents.findIndex(s => s._id.toString() === student._id.toString());
    if (rankIndex !== -1) {
      studentRank = rankIndex + 1;
    }

    const disposition = req.query.dl === "1" ? "attachment" : "inline";
    await generateStudentReportPDF(
      student,
      {
        recentFees,
        recentScores,
        attendancePercentage,
        presentDays,
        absentDays,
        totalDays,
        studentRank,
      },
      res,
      disposition
    );
  } catch (err) {
    console.error("Error generating student report:", err);
    if (!res.headersSent) {
      res.status(500).send("Error generating student report");
    }
  }
};

exports.printStudentDirectory = async (req, res) => {
  try {
    const students = await User.find({ batch: { $in: req.viewingBatches } })
      .populate('batch')
      .lean();

    students.sort(sortStudentsByBatchAndId);

    const disposition = req.query.dl === "1" ? "attachment" : "inline";
    await generateStudentDirectoryPDF(students, req.viewingYear, res, disposition);
  } catch (err) {
    console.error("Error printing student directory:", err);
    if (!res.headersSent) {
      res.status(500).send("Error printing directory");
    }
  }
};
