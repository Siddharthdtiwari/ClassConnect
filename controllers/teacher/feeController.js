const User = require("../../models/User");
const Batch = require("../../models/Batch");
const Fee = require("../../models/Fee");
const { getAvailableAcademicYears, calculateCurrentAcademicYear } = require("../../utils/academicYear");
const { sortStudentsByBatchAndId } = require("../../utils/sortHelpers");
const { generateFeeDefaultersPDF } = require("../../utils/pdfUtils");
const { ACADEMIC_MONTHS } = require("../../utils/constants");
const { logAudit } = require("../../utils/auditService");
exports.renderRevenueReport = async (req, res) => {
  try {
    const months = ACADEMIC_MONTHS;

    const fees = await Fee.find({
      status: "Paid",
      batch: { $in: req.viewingBatches }
    }).populate('batch');

    const monthlyRevenue = {};
    const standardStats = {};
    const methodStats = { Cash: 0, UPI: 0, Razorpay: 0 };
    let totalRevenue = 0;

    months.forEach((month) => {
      monthlyRevenue[month] = 0;
    });

    fees.forEach((fee) => {
      if (monthlyRevenue[fee.month] !== undefined) {
        monthlyRevenue[fee.month] += fee.amount;
      }

      const batchName = fee.batch ? fee.batch.name : 'Unknown';
      if (!standardStats[batchName]) {
        standardStats[batchName] = { total: 0, count: 0 };
      }
      standardStats[batchName].total += fee.amount;
      standardStats[batchName].count++;

      if (methodStats[fee.method] !== undefined) {
        methodStats[fee.method]++;
      }

      totalRevenue += fee.amount;
    });

    const paymentCount = fees.length;
    const averageRevenue = paymentCount > 0 ? (totalRevenue / paymentCount).toFixed(2) : 0;

    const recentPayments = await Fee.find({ status: "Paid", batch: { $in: req.viewingBatches } })
      .populate('batch')
      .sort({ datePaid: -1 })
      .limit(10);

    const years = getAvailableAcademicYears();

    res.render("teacher/revenue_report", {
      months,
      monthlyRevenue,
      totalRevenue,
      averageRevenue,
      paymentCount,
      standardStats,
      methodStats,
      recentPayments,
      years,
      selectedYear: req.viewingYear,
    });
  } catch (err) {
    console.error("Error generating revenue report:", err);
    res.status(500).send("Error generating revenue report");
  }
};

exports.renderManageFees = async (req, res) => {
  try {
    const batches = await Batch.find({ academicYear: req.viewingYear }).lean();
    const getBatchOrderValue = (name) => {
      if (!name) return 999;
      const lowerName = name.toLowerCase();
      if (lowerName.includes("pre") || lowerName.includes("kg")) return 0;
      const match = lowerName.match(/^(\d+)/);
      if (match) return parseInt(match[1]);
      return 100;
    };
    batches.sort((a, b) => getBatchOrderValue(a.name) - getBatchOrderValue(b.name));

    const students = await User.find(
      { batch: { $in: req.viewingBatches } },
      "studentId studentName batch monthlyFee"
    ).populate('batch').lean();
    students.sort(sortStudentsByBatchAndId);
    
    const allFees = await Fee.find({ batch: { $in: req.viewingBatches } }).populate('batch').lean();

    const months = ACADEMIC_MONTHS;

    const report = students.map((student) => {
      const studentFees = allFees.filter(f => f.studentId === student.studentId);

      let totalPaid = 0;
      const records = {};

      months.forEach((month) => {
        const feeRecord = studentFees.find((f) => f.month === month);

        if (feeRecord) {
          records[month] = {
            status: "Paid",
            amount: feeRecord.amount,
            datePaid: new Date(feeRecord.datePaid),
            method: feeRecord.method,
          };
          totalPaid += feeRecord.amount;
        } else {
          records[month] = { status: "Unpaid" };
        }
      });

      const monthlyFee = student.monthlyFee || 0;
      const totalDue = monthlyFee * months.length;
      const balance = totalDue - totalPaid;

      return {
        _id: student._id,
        studentName: student.studentName,
        studentId: student.studentId,
        standard: (student.batch ? student.batch.name : 'Unknown'),
        records: records,
        totalPaid: totalPaid,
        totalDue: totalDue,
        balance: balance,
      };
    });

    res.render("teacher/manage_fees", { report, months, students, batches });
  } catch (err) {
    console.error("Error loading fees manager:", err);
    res.status(500).send("Error loading fees manager");
  }
};

exports.renderFeeDefaulters = async (req, res) => {
  try {
    const selectedYearStr = req.query.year || req.viewingYear;
    const years = getAvailableAcademicYears(5).map(y => parseInt(y.split("-")[0]));
    const selectedYear = parseInt(selectedYearStr.split("-")[0]);

    const batches = await Batch.find({ academicYear: selectedYearStr });
    const batchIds = batches.map(b => b._id);
    
    const students = await User.find({ batch: { $in: batchIds } }).populate('batch').lean();
    students.sort(sortStudentsByBatchAndId);
    const fees = await Fee.find({ batch: { $in: batchIds }, status: 'Paid' }).lean();

    const allMonths = ACADEMIC_MONTHS;
    
    let elapsedMonths = [...allMonths];
    const today = new Date();
    const currentAcademicYear = calculateCurrentAcademicYear();
    
    if (selectedYearStr === currentAcademicYear) {
      const currentMonth = today.getMonth();
      const monthMap = { 5:0, 6:1, 7:2, 8:3, 9:4, 10:5, 11:6, 0:7, 1:8, 2:9, 3:10, 4:11 };
      const elapsedIndex = monthMap[currentMonth] !== undefined ? monthMap[currentMonth] : 11;
      elapsedMonths = allMonths.slice(0, elapsedIndex + 1);
    }

    const defaulters = [];
    const monthData = {};
    allMonths.forEach(m => { monthData[m] = []; });

    students.forEach(student => {
      const studentFees = fees.filter(f => f.studentId === student.studentId);
      const paidMonths = studentFees.map(f => f.month);
      const unpaidMonths = elapsedMonths.filter(m => !paidMonths.includes(m));

      if (unpaidMonths.length > 0) {
        const monthlyFee = student.monthlyFee || 0;
        const balance = unpaidMonths.length * monthlyFee;

        const defaulter = {
          studentId: student.studentId,
          studentName: student.studentName,
          mobileNo: student.mobileNo,
          standard: student.batch ? student.batch.name : 'Unknown',
          profilePhoto: student.profilePhoto,
          unpaidMonths,
          balance
        };
        defaulters.push(defaulter);

        unpaidMonths.forEach(m => {
          monthData[m].push({
            standard: student.batch ? student.batch.name : 'Unknown',
            studentId: student.studentId,
            studentName: student.studentName,
            balance: monthlyFee
          });
        });
      }
    });

    res.render("teacher/fee_defaulters", {
      defaulters,
      monthData,
      effectiveMonths: elapsedMonths,
      years,
      selectedYear,
      selectedYearStr,
      headerUrl: ""
    });
  } catch (err) {
    console.error("Fee defaulters error:", err);
    res.status(500).send("Server Error");
  }
};

exports.downloadFeeDefaulters = async (req, res) => {
  try {
    const selectedYearStr = req.query.year || req.viewingYear;
    const filterType = req.query.type; // 'batch', 'month', 'allBatches', 'allMonths'
    const filterValue = req.query.value;
    const reportTitle = req.query.title || "FEE DEFAULTERS REPORT";

    const batches = await Batch.find({ academicYear: selectedYearStr });
    const batchIds = batches.map(b => b._id);
    
    const students = await User.find({ batch: { $in: batchIds } }).populate('batch').lean();
    students.sort(sortStudentsByBatchAndId);
    const fees = await Fee.find({ batch: { $in: batchIds }, status: 'Paid' }).lean();

    const allMonths = ACADEMIC_MONTHS;
    
    let elapsedMonths = [...allMonths];
    const today = new Date();
    const currentAcademicYear = calculateCurrentAcademicYear();
    
    if (selectedYearStr === currentAcademicYear) {
      const currentMonth = today.getMonth();
      const monthMap = { 5:0, 6:1, 7:2, 8:3, 9:4, 10:5, 11:6, 0:7, 1:8, 2:9, 3:10, 4:11 };
      const elapsedIndex = monthMap[currentMonth] !== undefined ? monthMap[currentMonth] : 11;
      elapsedMonths = allMonths.slice(0, elapsedIndex + 1);
    }

    let defaulters = [];
    let monthData = {};
    allMonths.forEach(m => { monthData[m] = []; });

    students.forEach(student => {
      const studentFees = fees.filter(f => f.studentId === student.studentId);
      const paidMonths = studentFees.map(f => f.month);
      const unpaidMonths = elapsedMonths.filter(m => !paidMonths.includes(m));

      if (unpaidMonths.length > 0) {
        const monthlyFee = student.monthlyFee || 0;
        const balance = unpaidMonths.length * monthlyFee;

        const defaulter = {
          studentId: student.studentId,
          studentName: student.studentName,
          mobileNo: student.mobileNo,
          standard: student.batch ? student.batch.name : 'Unknown',
          profilePhoto: student.profilePhoto,
          unpaidMonths,
          balance
        };
        defaulters.push(defaulter);

        unpaidMonths.forEach(m => {
          monthData[m].push({
            standard: student.batch ? student.batch.name : 'Unknown',
            studentId: student.studentId,
            studentName: student.studentName,
            profilePhoto: student.profilePhoto,
            balance: monthlyFee
          });
        });
      }
    });

    // Apply filtering based on requested PDF type
    if (filterType === 'batch') {
      defaulters = defaulters.filter(d => d.standard === filterValue);
      monthData = {};
      elapsedMonths = [];
    } else if (filterType === 'allBatches') {
      monthData = {};
      elapsedMonths = [];
    } else if (filterType === 'month') {
      defaulters = [];
      const tempMonthData = {};
      tempMonthData[filterValue] = monthData[filterValue] || [];
      monthData = tempMonthData;
      elapsedMonths = [filterValue];
    } else if (filterType === 'allMonths') {
      defaulters = [];
      // keep full monthData
    }

    await generateFeeDefaultersPDF({
      defaulters,
      monthData,
      effectiveMonths: elapsedMonths,
      selectedYearStr,
      reportTitle
    }, res, "inline");

  } catch (err) {
    console.error("Fee defaulters download error:", err);
    res.status(500).send("Error generating PDF");
  }
};
exports.processAddFees = async (req, res) => {
  try {
    const { studentId, standard, amount, month, year, method, datePaid } = req.body;
    const batchId = standard; 
    const studentObj = await User.findById(studentId).populate('batch');
    
    if (!studentObj) {
      return res.status(404).json({ success: false, message: "Student not found." });
    }

    const existingFee = await Fee.findOne({ studentId: studentObj.studentId, month, year, batch: batchId });
    if (existingFee) {
      return res.status(400).json({ success: false, message: "Fee already exists for this month." });
    }
    
    const fee = new Fee({ 
      studentId: studentObj.studentId, 
      studentName: studentObj.studentName, 
      studentEmail: studentObj.email || "",
      userRef: studentObj._id,
      batch: batchId, 
      amount, 
      month, 
      year, 
      method, 
      datePaid, 
      status: "Paid" 
    });
    const savedFee = await fee.save();

    // Send email receipt
    if (studentObj.email) {
      const { sendFeeReceipt } = require("../../utils/emailService");
      sendFeeReceipt(studentObj.email, studentObj.studentName, month, year, amount, {
        fee: savedFee.toObject(),
        student: studentObj.toObject ? studentObj.toObject() : studentObj
      }).catch(err => console.error("Error sending fee receipt email:", err));
    }

    await logAudit({
      action: "CREATE",
      entityType: "Fee",
      entityId: savedFee._id,
      details: `Collected fee for ${studentObj.studentName} (${month} ${year}): ₹${amount}`,
      academicYear: req.viewingYear
    });

    res.json({ success: true, message: "Fee added successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Error adding fee" });
  }
};

exports.renderBulkFees = async (req, res) => {
  try {
    const selectedYearStr = req.query.year || req.viewingYear;
    const years = getAvailableAcademicYears(5).map(y => parseInt(y.split("-")[0]));
    const selectedYear = parseInt(selectedYearStr.split("-")[0]);

    const batches = await Batch.find({ academicYear: selectedYearStr });
    const batchIds = batches.map(b => b._id);
    
    const students = await User.find({ batch: { $in: batchIds } }).populate('batch').lean();
    students.sort(sortStudentsByBatchAndId);
    const fees = await Fee.find({ batch: { $in: batchIds }, status: 'Paid' }).lean();

    const months = ACADEMIC_MONTHS;

    const feeMap = {};
    students.forEach(student => {
      feeMap[student.studentId] = {};
    });

    fees.forEach(fee => {
      if (feeMap[fee.studentId]) {
        feeMap[fee.studentId][fee.month] = fee;
      }
    });

    const users = students.map(student => ({
      _id: student._id,
      studentId: student.studentId,
      studentName: student.studentName,
      monthlyFee: student.monthlyFee || 0,
      standard: student.batch ? student.batch._id : ''
    }));

    res.render("teacher/bulk_fees", {
      users,
      months,
      feeMap,
      years,
      selectedYear
    });
  } catch (err) {
    console.error("Error rendering bulk fees:", err);
    res.status(500).send("Server Error");
  }
};

exports.processBulkSave = async (req, res) => {
  try {
    const { updates } = req.body;
    if (!updates || !Array.isArray(updates)) {
      return res.status(400).json({ success: false, message: "Invalid updates data." });
    }

    const { sendFeeReceipt } = require("../../utils/emailService");

    for (const update of updates) {
      const { studentId, standard, amount, month, year, method, datePaid, deleteAction } = update;
      
      if (deleteAction) {
        await Fee.findOneAndDelete({ studentId, month, year, batch: standard });
        continue;
      }
      
      const studentObj = await User.findOne({ studentId, batch: standard }).populate('batch');
      if (!studentObj) {
        console.warn(`[Bulk Save] Student not found for studentId: ${studentId}`);
        continue;
      }

      let fee = await Fee.findOne({ studentId, month, year, batch: standard });
      if (!fee) {
        fee = new Fee({
          studentId,
          studentName: studentObj.studentName,
          studentEmail: studentObj.email || "",
          userRef: studentObj._id,
          batch: standard,
          month,
          year,
          amount,
          method,
          datePaid,
          status: "Paid"
        });
      } else {
        fee.amount = amount;
        fee.method = method;
        fee.datePaid = datePaid;
        fee.status = "Paid";
        fee.studentEmail = studentObj.email || "";
        fee.userRef = studentObj._id;
      }

      const savedFee = await fee.save();

      if (studentObj.email) {
        sendFeeReceipt(studentObj.email, studentObj.studentName, month, year, amount, {
          fee: savedFee.toObject(),
          student: studentObj.toObject ? studentObj.toObject() : studentObj
        }).catch(err => console.error(`[Bulk Save] Error sending email to ${studentObj.email}:`, err));
      }
    }

    await logAudit({
      action: "BULK_UPDATE",
      entityType: "Fee",
      details: `Bulk saved fee records (${updates.length} updates).`,
      academicYear: req.viewingYear
    });

    res.json({ success: true, message: "Bulk fees updated successfully" });
  } catch (err) {
    console.error("Error saving bulk fees:", err);
    res.status(500).json({ success: false, message: "Error saving bulk fees" });
  }
};

exports.downloadFeeCollectionSheet = async (req, res) => {
  try {
    const month = req.query.month;
    const year = req.query.calendarYear || req.query.year;
    if (!month || !year) {
      return res.status(400).send("Month and Year are required.");
    }

    const { ACADEMIC_MONTHS } = require("../../utils/constants");
    const monthIndex = ACADEMIC_MONTHS.indexOf(month);
    let nextMonth = "Month";
    if (monthIndex !== -1 && monthIndex < ACADEMIC_MONTHS.length - 1) {
      nextMonth = ACADEMIC_MONTHS[monthIndex + 1];
    } else if (monthIndex === ACADEMIC_MONTHS.length - 1) {
      nextMonth = ACADEMIC_MONTHS[0]; // Next academic year's first month
    }

    const Batch = require("../../models/Batch");
    const User = require("../../models/User");
    const Teacher = require("../../models/Teacher");
    const { sortStudentsByBatchAndId } = require("../../utils/sortHelpers");
    const { generateFeeCollectionSheetPDF } = require("../../utils/pdfUtils");

    const batches = await Batch.find({ academicYear: req.viewingYear });
    const batchIds = batches.map(b => b._id);
    
    const students = await User.find({ batch: { $in: batchIds } }).populate('batch').lean();
    students.sort(sortStudentsByBatchAndId);

    const teachers = await Teacher.find({ isActive: true }).lean();

    const data = {
      month,
      year,
      nextMonth,
      students,
      teachers,
      selectedYearStr: req.viewingYear
    };

    await generateFeeCollectionSheetPDF(data, res, "inline");

  } catch (err) {
    console.error("Error generating fee collection sheet:", err);
    res.status(500).send("Error generating PDF");
  }
};

exports.downloadFeeSummaryTeacher = async (req, res) => {
  try {
    const studentId = req.params.id;
    const User = require("../../models/User");
    const Fee = require("../../models/Fee");
    const { generateFeeSummaryPDF } = require("../../utils/pdfUtils");

    const student = await User.findById(studentId).populate('batch').lean();
    if (!student) return res.send("Student not found");

    const months = [
      "May", "June", "July", "August", "September", "October",
      "November", "December", "January", "February", "March", "April"
    ];

    const calendarToAcademic = {
      4: 0, 5: 1, 6: 2, 7: 3, 8: 4, 9: 5,
      10: 6, 11: 7, 0: 8, 1: 9, 2: 10, 3: 11,
    };

    const now = new Date();
    const currentMonthIndex = now.getMonth();
    const currentAcademicIndex = calendarToAcademic[currentMonthIndex];
    const FEE_DUE_DAY = 10;
    const monthsElapsed =
      now.getDate() >= FEE_DUE_DAY
        ? currentAcademicIndex + 1
        : currentAcademicIndex;

    let academicStartYear;
    if (student.batch && student.batch.academicYear) {
      academicStartYear = parseInt(student.batch.academicYear.split("-")[0]);
    } else {
      academicStartYear = currentMonthIndex >= 4 ? now.getFullYear() : now.getFullYear() - 1;
    }
    
    const yearForMonthIndex = (idx) =>
      idx < 8 ? academicStartYear : academicStartYear + 1;

    const fees = await Fee.find({ studentId: student.studentId, batch: student.batch._id }).lean();

    const feesByMonth = months.map((month, idx) => {
      const feeYear = yearForMonthIndex(idx);
      const feeRecord = fees.find(
        (f) => f.month === month && Number(f.year) === feeYear
      );

      if (feeRecord) {
        return {
          _id: feeRecord._id,
          month,
          amount: Number(feeRecord.amount || 0),
          status: feeRecord.status || "Paid",
          datePaid: feeRecord.datePaid,
          year: feeYear,
        };
      } else if (idx < monthsElapsed) {
        return {
          month,
          amount: Number(student.monthlyFee || 0),
          status: "Due",
          datePaid: null,
          year: feeYear,
        };
      } else {
        return {
          month,
          amount: Number(student.monthlyFee || 0),
          status: "Not Yet Due",
          datePaid: null,
          year: feeYear,
        };
      }
    });

    const monthlyFee = Number(student.monthlyFee || 0);
    const dueMonthsCount = feesByMonth.filter((f) => f.status === "Due").length;
    const totalDue = monthlyFee * dueMonthsCount;

    const disposition = req.query.dl ? "attachment" : "inline";
    await generateFeeSummaryPDF(student, feesByMonth, totalDue, res, disposition);
  } catch (err) {
    console.error(err);
    res.send("Error generating fee summary");
  }
};
