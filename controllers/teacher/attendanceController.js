const User = require("../../models/User");
const Batch = require("../../models/Batch");
const Attendance = require("../../models/Attendance");
const { sortStudentsByBatchAndId } = require("../../utils/sortHelpers");
const { logAudit } = require("../../utils/auditService");

exports.renderManageAttendance = async (req, res) => {
  try {
    const students = await User.find({ batch: { $in: req.viewingBatches } })
      .populate('batch')
      .lean();
    students.sort(sortStudentsByBatchAndId);
    const attendanceRecords = await Attendance.find({ batch: { $in: req.viewingBatches } }).lean();

    const attendanceMap = {};
    attendanceRecords.forEach((record) => {
      const dateString = record.date.toISOString().split('T')[0];
      attendanceMap[dateString] = {};
      (record.records || []).forEach(
        (r) => (attendanceMap[dateString][r.studentId] = r.status)
      );
    });

    res.render("teacher/manage_attendance", {
      students,
      attendance: attendanceMap,
    });
  } catch (err) {
    console.error("Manage attendance GET error:", err);
    res.status(500).send("Error loading attendance");
  }
};

exports.processManageAttendance = async (req, res) => {
  try {
    const { date, records, batchId } = req.body;
    let batchValue = batchId;

    if (!batchValue && records && records.length > 0) {
      const firstStudentId = records[0].studentId;
      const student = await User.findOne({ studentId: firstStudentId, batch: { $in: req.viewingBatches } }).populate('batch').lean();
      if (student) {
        batchValue = (student.batch ? student.batch._id : null);
      }
    }

    let attendance = await Attendance.findOne({ date, batch: { $in: req.viewingBatches } });
    if (attendance) {
      attendance.records = records;
    } else {
      attendance = new Attendance({
        batch: batchValue,
        date: new Date(date),
        records,
      });
    }
    await attendance.save();

    await logAudit({
      action: "UPDATE",
      entityType: "Attendance",
      details: `Saved attendance for ${date}`,
      academicYear: req.viewingYear
    });

    res.json({ success: true, message: "Attendance saved successfully!" });
  } catch (err) {
    console.error("Error saving attendance:", err);
    res.status(500).json({ success: false, message: "Failed to save attendance." });
  }
};

exports.renderDetailedAttendance = async (req, res) => {
  try {
    const students = await User.find({ batch: { $in: req.viewingBatches } }).populate('batch').lean();
    students.sort(sortStudentsByBatchAndId);
    const attendanceRecords = await Attendance.find({ batch: { $in: req.viewingBatches } }).lean();

    const detailedReport = {};
    const allAttendanceDates = new Set();

    students.forEach(student => {
      detailedReport[student.studentId] = {
        studentId: student.studentId,
        studentName: student.studentName,
        records: {},
        presentCount: 0,
        totalRecordedDays: 0,
      };
    });

    attendanceRecords.forEach(record => {
      const dateKey = record.date.toISOString().split('T')[0];
      allAttendanceDates.add(dateKey);

      (record.records || []).forEach(r => {
        if (detailedReport[r.studentId]) {
          const studentData = detailedReport[r.studentId];
          studentData.records[dateKey] = r.status;

          if (r.status === 'P') {
            studentData.presentCount++;
            studentData.totalRecordedDays++;
          } else if (r.status === 'A') {
            studentData.totalRecordedDays++;
          }
        }
      });
    });

    const sortedDates = Array.from(allAttendanceDates).sort();
    const reportArray = Object.values(detailedReport);

    res.render("teacher/detailed_attendance", {
      report: reportArray,
      allDates: sortedDates,
    });
  } catch (err) {
    console.error("Error generating detailed attendance report:", err);
    res.status(500).send("Failed to generate detailed attendance report.");
  }
};

exports.renderDefaulters = async (req, res) => {
  try {
    const { year, month } = req.params;

    if (!/^\d{4}$/.test(year) || !/^(0?[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).send("Invalid year or month format");
    }

    const startDate = new Date(`${year}-${month}-01`);
    const endDate = new Date(year, parseInt(month), 0);

    const students = await User.find({ batch: { $in: req.viewingBatches } }).populate('batch').lean();

    const attendanceDocs = await Attendance.find({
      date: {
        $gte: startDate.toISOString().split("T")[0],
        $lte: endDate.toISOString().split("T")[0],
      },
      batch: { $in: req.viewingBatches },
    }).lean();

    const stats = {};
    students.forEach((s) => {
      stats[s.studentId] = {
        studentId: s.studentId,
        studentName: s.studentName,
        standard: (s.batch ? s.batch.name : 'Unknown'),
        mobileNo: s.mobileNo,
        present: 0,
        absent: 0,
        total: 0,
        percentage: 0,
      };
    });

    attendanceDocs.forEach((doc) => {
      doc.records.forEach((r) => {
        if (stats[r.studentId]) {
          if (r.status === "P") stats[r.studentId].present++;
          if (r.status === "A") stats[r.studentId].absent++;
          stats[r.studentId].total++;
        }
      });
    });

    const defaulters = Object.values(stats)
      .map((s) => {
        s.percentage = s.total > 0 ? (s.present / (s.present + s.absent)) * 100 : 0;
        return s;
      })
      .filter((s) => s.percentage < 75)
      .sort((a, b) => Number(a.percentage) - Number(b.percentage));

    const headerUrl = process.env.CLOUDINARY_HEADER_URL || "";

    res.render("teacher/defaulters", { year, month, defaulters, headerUrl });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error generating defaulter list");
  }
};

exports.downloadDefaulters = async (req, res) => {
  try {
    const { year, month } = req.params;

    if (!/^\d{4}$/.test(year) || !/^(0?[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).send("Invalid year or month format");
    }

    const startDate = new Date(`${year}-${month}-01`);
    const endDate = new Date(year, parseInt(month), 0);

    const students = await User.find({ batch: { $in: req.viewingBatches } }).populate('batch').lean();

    const attendanceDocs = await Attendance.find({
      date: {
        $gte: startDate.toISOString().split("T")[0],
        $lte: endDate.toISOString().split("T")[0],
      },
      batch: { $in: req.viewingBatches },
    }).lean();

    const stats = {};
    students.forEach((s) => {
      stats[s.studentId] = {
        studentId: s.studentId,
        studentName: s.studentName,
        standard: (s.batch ? s.batch.name : 'Unknown'),
        mobileNo: s.mobileNo,
        present: 0,
        absent: 0,
        total: 0,
        percentage: 0,
      };
    });

    attendanceDocs.forEach((doc) => {
      doc.records.forEach((r) => {
        if (stats[r.studentId]) {
          if (r.status === "P") stats[r.studentId].present++;
          if (r.status === "A") stats[r.studentId].absent++;
          stats[r.studentId].total++;
        }
      });
    });

    const defaulters = Object.values(stats)
      .map((s) => {
        s.percentage = s.total > 0 ? (s.present / (s.present + s.absent)) * 100 : 0;
        return s;
      })
      .filter((s) => s.percentage < 75)
      .sort((a, b) => Number(a.percentage) - Number(b.percentage));

    const { generateAttendanceDefaultersPDF } = require("../../utils/pdfUtils");
    await generateAttendanceDefaultersPDF({ defaulters, month, year }, res, "attachment");
  } catch (err) {
    console.error("Attendance defaulters download error:", err);
    res.status(500).send("Error generating PDF");
  }
};


exports.renderBulkAttendance = async (req, res) => {
  try {
    const today = new Date();
    const selectedMonth = req.query.month ? parseInt(req.query.month) : today.getMonth() + 1;
    const selectedYear = req.query.year ? parseInt(req.query.year) : today.getFullYear();

    const { getAvailableAcademicYears } = require("../../utils/academicYear");
    const years = getAvailableAcademicYears(5).map(y => parseInt(y.split("-")[0]));

    const students = await User.find({ batch: { $in: req.viewingBatches } }).populate('batch').lean();
    students.sort(sortStudentsByBatchAndId);

    const numDays = new Date(selectedYear, selectedMonth, 0).getDate();
    const daysArray = [];
    for (let d = 1; d <= numDays; d++) {
      const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      daysArray.push(dateStr);
    }

    const startDateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
    const endDateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(numDays).padStart(2, '0')}`;

    const attendanceRecords = await Attendance.find({
      batch: { $in: req.viewingBatches },
      date: {
        $gte: new Date(startDateStr),
        $lte: new Date(endDateStr)
      }
    }).lean();

    const attendanceMap = {};
    daysArray.forEach(date => {
      attendanceMap[date] = {};
    });

    attendanceRecords.forEach(record => {
      const dateStr = record.date.toISOString().split('T')[0];
      if (attendanceMap[dateStr]) {
        (record.records || []).forEach(r => {
          attendanceMap[dateStr][r.studentId] = r.status;
        });
      }
    });

    res.render("teacher/bulk_attendance", {
      students,
      daysArray,
      attendanceMap,
      selectedMonth,
      selectedYear,
      years
    });
  } catch (err) {
    console.error("Error rendering bulk attendance:", err);
    res.status(500).send("Error rendering bulk attendance");
  }
};

exports.processBulkSaveAttendance = async (req, res) => {
  try {
    const { attendanceData } = req.body;
    if (!attendanceData) {
      return res.status(400).json({ success: false, message: "Missing attendance data" });
    }

    for (const [dateStr, records] of Object.entries(attendanceData)) {
      const recordsByBatch = {};

      for (const r of records) {
        const student = await User.findOne({ studentId: r.studentId });
        if (student && student.batch) {
          const batchId = student.batch.toString();
          if (!recordsByBatch[batchId]) {
            recordsByBatch[batchId] = [];
          }
          recordsByBatch[batchId].push({
            studentId: r.studentId,
            userRef: student._id,
            status: r.status
          });
        }
      }

      for (const [batchId, batchRecords] of Object.entries(recordsByBatch)) {
        let attendance = await Attendance.findOne({
          date: new Date(dateStr),
          batch: batchId
        });

        if (attendance) {
          batchRecords.forEach(newRecord => {
            const existingIndex = attendance.records.findIndex(r => r.studentId === newRecord.studentId);
            if (existingIndex !== -1) {
              attendance.records[existingIndex].status = newRecord.status;
            } else {
              attendance.records.push(newRecord);
            }
          });
        } else {
          attendance = new Attendance({
            batch: batchId,
            date: new Date(dateStr),
            records: batchRecords
          });
        }
        await attendance.save();
      }
    }

    await logAudit({
      action: "BULK_UPDATE",
      entityType: "Attendance",
      details: `Bulk saved attendance records`,
      academicYear: req.viewingYear
    });

    res.json({ success: true, message: "Attendance saved successfully" });
  } catch (err) {
    console.error("Error saving bulk attendance:", err);
    res.status(500).json({ success: false, message: "Failed to save attendance" });
  }
};
