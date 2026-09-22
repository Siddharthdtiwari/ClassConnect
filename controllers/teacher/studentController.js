const mongoose = require("mongoose");
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
const crypto = require("crypto");
const { renderError } = require("../../utils/renderError");
const { NA_STATUS } = require("../../utils/feeHelpers");
const Syllabus = require("../../models/Syllabus");
const StudentSyllabusProgress = require("../../models/StudentSyllabusProgress");

// A student who joins after the academic year has already started shouldn't show
// as owing fees for months before they enrolled, or be marked absent for tests
// that happened before they existed -- this backfills "N/A" fee records and
// null-score (shown as Absent) test records for every month/test strictly before
// their admission date. Shared by both the single Add Student form and Bulk Add.
async function backfillMidYearStudent({ studentId, studentName, userRef, batch, admissionDate }) {
  if (!batch || !admissionDate) return;

  const Test = require("../../models/Test");
  const pastTests = await Test.find({ batch: batch._id, testDate: { $lt: admissionDate } }).lean();
  if (pastTests.length > 0) {
    const scoreOps = pastTests.map(test => ({
      insertOne: {
        document: {
          studentId,
          studentName,
          userRef,
          batch: batch._id,
          testId: test._id,
          testName: test.testName,
          score: null, // Platform marks absent as null
          percentage: 0
        }
      }
    }));
    await Score.bulkWrite(scoreOps);
  }

  const { ACADEMIC_MONTHS } = require("../../utils/constants");
  const { feeYearForMonth } = require("../../utils/feeHelpers");

  const admissionMonthName = admissionDate.toLocaleString('default', { month: 'long' });
  const admissionMonthIndex = ACADEMIC_MONTHS.indexOf(admissionMonthName);

  if (admissionMonthIndex > 0) {
    const pastMonths = ACADEMIC_MONTHS.slice(0, admissionMonthIndex);
    const feeOps = pastMonths.map(month => ({
      insertOne: {
        document: {
          studentId,
          studentName,
          userRef,
          batch: batch._id,
          month,
          year: feeYearForMonth(month, batch.academicYear),
          amount: 0,
          status: "NA",
          naReason: "Joined mid-year"
        }
      }
    }));
    await Fee.bulkWrite(feeOps);
  }
}

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
    renderError(req, res, 500, "Error loading students");
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
      admissionDate,
      session,
    } = req.body;
    const hashedPassword = await bcrypt.hash(password, 12);

    let profilePhotoUrl = null;
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, "student-profiles");
      profilePhotoUrl = result.secure_url;
    }

    const parsedAdmissionDate = admissionDate ? new Date(admissionDate) : new Date();

    const newStudent = new User({
      batch: batchId,
      studentId,
      studentName,
      email,
      password: hashedPassword,
      mobileNo,
      monthlyFee,
      session: session || "NA",
      profilePhoto: profilePhotoUrl,
      admissionDate: parsedAdmissionDate,
    });
    await newStudent.save();

    // Automation Logic
    const batch = await Batch.findById(batchId);
    if (batch) {
      await backfillMidYearStudent({
        studentId,
        studentName,
        userRef: newStudent._id,
        batch,
        admissionDate: parsedAdmissionDate,
      });
    }

    await logAudit(req, {
      action: "CREATE",
      entityType: "User",
      entityId: newStudent._id,
      details: `Added new student: ${studentName} (${studentId}) with automated backfill`,
      academicYear: req.viewingYear
    });
    res.redirect("/teacher/manage_students");
  } catch (err) {
    console.error(err);
    renderError(req, res, 500, "Failed to add student");
  }
};

exports.renderEditProfile = async (req, res) => {
  try {
    if (!require('mongoose').Types.ObjectId.isValid(req.params.id)) return renderError(req, res, 404, "Student not found");
    const student = await User.findById(req.params.id).lean();
    if (!student) return renderError(req, res, 404, "Student not found");
    const batches = await Batch.find({ academicYear: req.viewingYear }).lean();
    batches.sort(sortBatches);
    res.render("teacher/edit_profile", { student, batches });
  } catch (err) {
    console.error(err);
    renderError(req, res, 500, "Error loading student");
  }
};

exports.processEditProfile = async (req, res) => {
  try {
    const { studentName, studentId, batchId, mobileNo, monthlyFee, email, admissionDate, session } = req.body;
    const updateData = { studentName, batch: batchId, mobileNo, monthlyFee, email };
    if (session) updateData.session = session;
    
    if (admissionDate) {
      updateData.admissionDate = new Date(admissionDate);
    }

    if (studentId) {
      const existingStudent = await User.findOne({ studentId, batch: batchId, _id: { $ne: req.params.id } });
      if (existingStudent) {
        return renderError(req, res, 400, "Student ID already exists in this batch");
      }
      updateData.studentId = studentId;
    }

    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, "student-profiles");
      updateData.profilePhoto = result.secure_url;
    }

    if (!require('mongoose').Types.ObjectId.isValid(req.params.id)) return renderError(req, res, 400, "Invalid Student ID");
    await User.findByIdAndUpdate(req.params.id, updateData);
    await logAudit(req, {
      action: "UPDATE",
      entityType: "User",
      entityId: req.params.id,
      details: `Updated student profile: ${studentName}`,
      academicYear: req.viewingYear
    });
    res.redirect(`/teacher/view_profile/${req.params.id}`);
  } catch (err) {
    console.error(err);
    renderError(req, res, 500, "Error updating profile");
  }
};

exports.toggleActiveStatus = async (req, res) => {
  try {
    if (!require('mongoose').Types.ObjectId.isValid(req.params.id)) return renderError(req, res, 404, "Student not found");
    const student = await User.findById(req.params.id);
    if (!student) return res.status(404).json({ success: false, message: "Student not found" });
    
    student.isActive = !student.isActive;
    await student.save();
    
    await logAudit(req, {
      action: "UPDATE",
      entityType: "User",
      entityId: student._id,
      details: `Toggled active status for ${student.studentName} to ${student.isActive ? 'Active' : 'Inactive'}`,
      academicYear: req.viewingYear || "All"
    });
    
    res.json({ success: true, isActive: student.isActive });
  } catch (err) {
    console.error("Error toggling status:", err);
    res.status(500).json({ success: false, message: "Error toggling status" });
  }
};

exports.renderViewProfile = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return renderError(req, res, 404, "Student not found");
    }

    const student = await User.findById(req.params.id).populate('batch').lean();
    if (!student) return renderError(req, res, 404, "Student not found");

    const studentId = student.studentId;
    const batchFilter = (req.viewingBatches && req.viewingBatches.length > 0) 
      ? { $in: req.viewingBatches } 
      : (student.batch ? student.batch._id : { $exists: true });

    const recentFees = await Fee.find({ studentId: studentId, status: "Paid", batch: batchFilter })
      .populate('batch')
      .sort({ datePaid: -1 })
      .lean();

    let recentScores = await Score.find({ studentId: studentId, batch: batchFilter })
      .populate('testId')
      .lean();

    recentScores.sort((a, b) => {
      const dateA = a.testId && a.testId.testDate ? new Date(a.testId.testDate) : new Date(a.createdAt);
      const dateB = b.testId && b.testId.testDate ? new Date(b.testId.testDate) : new Date(b.createdAt);
      return dateB - dateA;
    });

    const allAttendanceRecords = await Attendance.find({
      "records.studentId": studentId,
      batch: batchFilter,
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

    // Syllabus progress: chapter count comes from the teacher's own tracker for this
    // student's batch; completion status is this specific student's own revision record.
    let syllabusProgress = [];
    if (student.batch) {
      const [syllabusRecords, progressRecords] = await Promise.all([
        Syllabus.find({ batch: student.batch._id }).lean(),
        StudentSyllabusProgress.find({ userRef: student._id, batch: student.batch._id }).lean(),
      ]);
      const progressBySubject = {};
      progressRecords.forEach(p => { progressBySubject[p.subject] = p.chapterStatuses || {}; });

      syllabusProgress = syllabusRecords.map(record => {
        const totalChapters = record.totalChapters || 10;
        const statuses = progressBySubject[record.subject] || {};
        let completed = 0;
        for (let i = 1; i <= totalChapters; i++) {
          if (statuses[i.toString()] === "completed") completed++;
        }
        return { subject: record.subject, completed, total: totalChapters };
      });
      syllabusProgress.sort((a, b) => a.subject.localeCompare(b.subject));
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
      syllabusProgress,
    });
  } catch (err) {
    console.error("Error loading student profile:", err);
    renderError(req, res, 500, "Error loading student profile");
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
    renderError(req, res, 500, "Error loading bulk add page");
  }
};

exports.processBulkSaveStudents = async (req, res) => {
  try {
    const studentsData = req.body;
    if (!Array.isArray(studentsData) || studentsData.length === 0) {
      return res.status(400).json({ error: "Invalid or empty data provided." });
    }

    const bulkOps = [];
    const opMeta = []; // aligned with bulkOps, used to backfill mid-year students after insert
    const errors = [];
    let processed = 0;

    const allStudentIds = studentsData.map(r => r.studentId).filter(Boolean);
    const existingStudents = await User.find({ studentId: { $in: allStudentIds }, batch: { $in: req.currentBatches } }).lean();
    // studentId alone is ambiguous across batches — key by (studentId, batch) so a
    // brand-new student in one batch isn't mistaken for an existing one just because
    // their ID string was reused by someone else in a different batch, which would
    // otherwise silently skip generating them a password.
    const existingMap = new Set(existingStudents.map(s => `${s.studentId}|${s.batch}`));

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

      if (["Morning", "Evening", "NA"].includes(row.session)) {
        updateDoc.session = row.session;
      }

      if (row.isActive !== undefined && row.isActive !== "") {
        updateDoc.isActive = row.isActive === true || row.isActive === "true";
      }

      let parsedAdmissionDate = null;
      if (row.admissionDate) {
        const d = new Date(row.admissionDate);
        if (!isNaN(d.getTime())) {
          parsedAdmissionDate = d;
          updateDoc.admissionDate = d;
        }
      }

      if (row.password && String(row.password).trim() !== "") {
        updateDoc.password = await bcrypt.hash(String(row.password).trim(), 12);
      } else {
        if (!row.id && !existingMap.has(`${row.studentId}|${row.batchId}`)) {
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
      opMeta.push(parsedAdmissionDate ? {
        studentId: row.studentId,
        studentName: row.studentName,
        batchId: row.batchId,
        admissionDate: parsedAdmissionDate,
      } : null);
      processed++;
    }));

    if (bulkOps.length > 0) {
      const bulkResult = await User.bulkWrite(bulkOps);
      await logAudit(req, {
        action: "BULK_UPDATE",
        entityType: "User",
        details: `Bulk saved ${processed} student records.`,
        academicYear: req.viewingYear
      });

      // Only newly-created (upserted) rows get the mid-year backfill — editing an
      // existing student's admission date shouldn't re-run the backfill and create
      // duplicate NA fee / absent score records for them.
      const upsertedIds = bulkResult.upsertedIds || {};
      const backfillIndices = Object.keys(upsertedIds).filter(idx => opMeta[idx]);
      if (backfillIndices.length > 0) {
        const batchIds = [...new Set(backfillIndices.map(idx => opMeta[idx].batchId))];
        const batches = await Batch.find({ _id: { $in: batchIds } }).lean();
        const batchMap = new Map(batches.map(b => [b._id.toString(), b]));

        await Promise.all(backfillIndices.map(idx => {
          const meta = opMeta[idx];
          const batch = batchMap.get(String(meta.batchId));
          if (!batch) return null;
          return backfillMidYearStudent({
            studentId: meta.studentId,
            studentName: meta.studentName,
            userRef: upsertedIds[idx],
            batch,
            admissionDate: meta.admissionDate,
          });
        }));
      }
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
      return renderError(req, res, 404, "No students found in the selected batches.");
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", "attachment; filename=all-student-reports.zip");

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(res);

    const studentIds = allStudentsData.map(s => s.studentId);

    // Fetch all related data upfront to avoid N+1 queries
    const allFees = await Fee.find({ studentId: { $in: studentIds }, status: { $in: ["Paid", NA_STATUS] }, batch: { $in: req.viewingBatches } })
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

    // studentId alone is ambiguous across batches — key every grouping and lookup
    // by (studentId, batch) so two students sharing a studentId string in different
    // batches never end up with each other's fees/scores/attendance in their PDF.
    const feesMap = {};
    allFees.forEach(fee => {
      const key = `${fee.studentId}|${fee.batch ? fee.batch._id.toString() : ""}`;
      if (!feesMap[key]) feesMap[key] = [];
      feesMap[key].push(fee);
    });

    const scoresMap = {};
    allScores.forEach(score => {
      const key = `${score.studentId}|${score.batch}`;
      if (!scoresMap[key]) scoresMap[key] = [];
      scoresMap[key].push(score);
    });

    for (let i = 0; i < allStudentsData.length; i++) {
      const student = allStudentsData[i];
      const studentId = student.studentId;
      const studentBatchId = student.batch ? student.batch._id.toString() : "";
      const key = `${studentId}|${studentBatchId}`;

      const recentFees = feesMap[key] || [];
      const recentScores = scoresMap[key] || [];

      let presentDays = 0;
      let absentDays = 0;
      let totalDays = 0;

      allAttendanceRecords.forEach((dayRecord) => {
        if (dayRecord.batch.toString() !== studentBatchId) return;
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
      renderError(req, res, 500, "Error generating bulk report");
    }
  }
};

  exports.generatePublicStudentReport = async (req, res) => {
    try {
      const { id, signature } = req.params;

      // Verify signature
      const expectedSignature = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(id).digest('hex');
      if (signature !== expectedSignature) {
        return renderError(req, res, 403, "Invalid or expired report link");
      }

      const student = await User.findById(id).populate('batch').lean();
      if (!student) return renderError(req, res, 404, "Student not found");
      if (!student.batch) return renderError(req, res, 400, "This student has no batch assigned.");

      const studentId = student.studentId;

      const recentFees = await Fee.find({ studentId: studentId, status: { $in: ["Paid", NA_STATUS] }, batch: student.batch._id })
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
        "inline"
      );
    } catch (err) {
      console.error("Error generating public student report:", err);
      renderError(req, res, 500, "Error generating public student report");
    }
  };

  exports.generateStudentReport = async (req, res) => {
    try {
      if (!require('mongoose').Types.ObjectId.isValid(req.params.id)) return renderError(req, res, 404, "Student not found");
      const student = await User.findById(req.params.id).populate('batch').lean();
      if (!student) return renderError(req, res, 404, "Student not found");
      if (!student.batch) return renderError(req, res, 400, "This student has no batch assigned.");

      const studentId = student.studentId;

      const recentFees = await Fee.find({ studentId: studentId, status: { $in: ["Paid", NA_STATUS] }, batch: student.batch._id })
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
        "inline"
      );
    } catch (err) {
      console.error("Error generating student report:", err);
      if (!res.headersSent) {
        renderError(req, res, 500, "Error generating student report");
      }
    }
  };

  exports.printStudentDirectory = async (req, res) => {
    try {
      const students = await User.find({ batch: { $in: req.viewingBatches } })
        .populate('batch')
        .lean();

      students.sort(sortStudentsByBatchAndId);

      await generateStudentDirectoryPDF(students, req.viewingYear, res, "inline");
    } catch (err) {
      console.error("Error printing student directory:", err);
      if (!res.headersSent) {
        renderError(req, res, 500, "Error printing directory");
      }
    }
  };