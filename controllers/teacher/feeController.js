const User = require("../../models/User");
const Batch = require("../../models/Batch");
const Fee = require("../../models/Fee");
const { getAvailableAcademicYears, calculateCurrentAcademicYear } = require("../../utils/academicYear");
const { sortStudentsByBatchAndId } = require("../../utils/sortHelpers");const { generateFeeDefaultersPDF } = require("../../utils/pdfUtils");
exports.renderDetailedFees = async (req, res) => {
  try {
    const students = await User.find(
      { batch: { $in: req.viewingBatches } },
      "studentId studentName batch monthlyFee"
    ).populate('batch').lean();
    students.sort(sortStudentsByBatchAndId);
    
    const allFees = await Fee.find({ batch: { $in: req.viewingBatches } }).populate('batch').lean();

    const months = [
      "May", "June", "July", "August", "September", "October",
      "November", "December", "January", "February", "March", "April",
    ];

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
        studentName: student.studentName,
        studentId: student.studentId,
        standard: (student.batch ? student.batch.name : 'Unknown'),
        records: records,
        totalPaid: totalPaid,
        totalDue: totalDue,
        balance: balance,
      };
    });

    res.render("teacher/detailed_fees", { report, months });
  } catch (err) {
    console.error("Error loading detailed fees report:", err);
    res.status(500).send("Error generating fees report");
  }
};

exports.renderRevenueReport = async (req, res) => {
  try {
    const months = [
      "May", "June", "July", "August", "September", "October",
      "November", "December", "January", "February", "March", "April"
    ];

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
    const months = ["May", "June", "July", "August", "September", "October", "November", "December", "January", "February", "March", "April"];
    const batches = await Batch.find({ academicYear: req.viewingYear });
    const batchIds = batches.map(b => b._id);
    
    const students = await User.find({ batch: { $in: batchIds } }).populate('batch');
    students.sort(sortStudentsByBatchAndId);
    const fees = await Fee.find({ batch: { $in: batchIds }, status: 'Paid' });

    const studentsWithFees = students.map(student => {
      const studentFees = {};
      fees.filter(f => f.studentId === student.studentId).forEach(f => {
        studentFees[f.month] = f.datePaid ? new Date(f.datePaid).toLocaleDateString('en-IN') : "Paid";
      });
      return {
        studentId: student.studentId,
        studentName: student.studentName,
        standard: student.batch ? student.batch.name : 'Unknown',
        fees: studentFees
      };
    });

    res.render("teacher/manage_fees", { studentsWithFees, months });
  } catch (err) {
    console.error("Error fetching fees:", err);
    res.status(500).send("Error fetching fees");
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

    const allMonths = ["May", "June", "July", "August", "September", "October", "November", "December", "January", "February", "March", "April"];
    
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

    const allMonths = ["May", "June", "July", "August", "September", "October", "November", "December", "January", "February", "March", "April"];
    
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
    }, res, "attachment");

  } catch (err) {
    console.error("Fee defaulters download error:", err);
    res.status(500).send("Error generating PDF");
  }
};

exports.renderAddFees = async (req, res) => {
  try {
    const batches = await Batch.find({ academicYear: req.viewingYear });
    const batchIds = batches.map(b => b._id);
    const users = await User.find({ batch: { $in: batchIds } }).populate('batch');
    users.sort(sortStudentsByBatchAndId);
    const months = ["May", "June", "July", "August", "September", "October", "November", "December", "January", "February", "March", "April"];
    res.render("teacher/add_fees", { users, months });
  } catch (err) {
    console.error("Add fees GET error:", err);
    res.status(500).send("Server error");
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
        student: studentObj.toObject ? studentObj.toObject() : studentObj,
      }).catch(err => console.error("Error sending fee receipt email:", err));
    }

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

    const months = [
      "May", "June", "July", "August", "September", "October",
      "November", "December", "January", "February", "March", "April",
    ];

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
    console.log(`[Bulk Save] Received updates count: ${updates ? updates.length : 0}`);
    if (!updates || !Array.isArray(updates)) {
      return res.status(400).json({ success: false, message: "Invalid updates data." });
    }

    const { sendFeeReceipt } = require("../../utils/emailService");

    for (const update of updates) {
      const { studentId, standard, amount, month, year, method, datePaid } = update;
      console.log(`[Bulk Save] Processing update for studentId: ${studentId}, month: ${month}, year: ${year}`);
      
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
      console.log(`[Bulk Save] Fee saved successfully for studentId: ${studentId}. Email: ${studentObj.email}`);

      if (studentObj.email) {
        sendFeeReceipt(studentObj.email, studentObj.studentName, month, year, amount, {
          fee: savedFee.toObject(),
          student: studentObj.toObject ? studentObj.toObject() : studentObj,
        }).catch(err => console.error(`[Bulk Save] Error sending email to ${studentObj.email}:`, err));
      }
    }

    res.json({ success: true, message: "Bulk fees updated successfully" });
  } catch (err) {
    console.error("Error saving bulk fees:", err);
    res.status(500).json({ success: false, message: "Error saving bulk fees" });
  }
};

