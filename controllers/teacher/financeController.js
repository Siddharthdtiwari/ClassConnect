const Transaction = require("../../models/Transaction");
const Fee = require("../../models/Fee");
const Batch = require("../../models/Batch");
const Teacher = require("../../models/Teacher");
const { ACADEMIC_MONTHS } = require("../../utils/constants");
const { logAudit } = require("../../utils/auditService");
const { renderError } = require("../../utils/renderError");

const MONTH_NAME_MAP = {
  0: "January",
  1: "February",
  2: "March",
  3: "April",
  4: "May",
  5: "June",
  6: "July",
  7: "August",
  8: "September",
  9: "October",
  10: "November",
  11: "December"
};

exports.renderFinance = async (req, res) => {
  try {
    const academicYear = req.viewingYear;
    const selectedMonth = req.query.month || "";

    // 1. Get all batches for the viewing academic year
    const yearBatches = await Batch.find({ academicYear }).distinct('_id');

    // 2. Fetch all paid fees for this academic year
    const paidFees = await Fee.find({
      batch: { $in: yearBatches },
      status: 'Paid'
    }).lean();

    // 3. Fetch all manual transactions for this academic year
    const allTransactions = await Transaction.find({ academicYear }).sort({ date: -1 }).lean();

    // 4. Calculate per-month breakdown
    const monthlyBreakdown = ACADEMIC_MONTHS.map(mName => {
      // Fees for this month
      const feeSum = paidFees
        .filter(f => f.month === mName)
        .reduce((sum, f) => sum + (f.amount || 0), 0);

      // Transactions for this month
      let manualInc = 0;
      let expSum = 0;
      allTransactions.forEach(t => {
        const tMonthName = MONTH_NAME_MAP[new Date(t.date).getMonth()];
        if (tMonthName === mName) {
          if (t.type === 'INCOME') manualInc += t.amount || 0;
          else if (t.type === 'EXPENSE') expSum += t.amount || 0;
        }
      });

      const totInc = feeSum + manualInc;
      const net = totInc - expSum;

      return {
        month: mName,
        feeRevenue: feeSum,
        manualIncome: manualInc,
        totalIncome: totInc,
        totalExpense: expSum,
        netProfit: net
      };
    });

    // 5. Compute summary stats based on selectedMonth filter
    let studentFeeRevenue = 0;
    let manualIncome = 0;
    let totalExpense = 0;
    let transactions = allTransactions;

    if (selectedMonth && ACADEMIC_MONTHS.includes(selectedMonth)) {
      // Month-specific stats
      const monthData = monthlyBreakdown.find(m => m.month === selectedMonth);
      if (monthData) {
        studentFeeRevenue = monthData.feeRevenue;
        manualIncome = monthData.manualIncome;
        totalExpense = monthData.totalExpense;
      }
      transactions = allTransactions.filter(t => MONTH_NAME_MAP[new Date(t.date).getMonth()] === selectedMonth);
    } else {
      // Academic year overall stats
      studentFeeRevenue = paidFees.reduce((sum, f) => sum + (f.amount || 0), 0);
      allTransactions.forEach(t => {
        if (t.type === 'INCOME') manualIncome += t.amount || 0;
        else if (t.type === 'EXPENSE') totalExpense += t.amount || 0;
      });
    }

    const totalIncome = studentFeeRevenue + manualIncome;
    const grossProfit = totalIncome - totalExpense;

    // 6. Get active teachers for staff salary selection
    const teachers = await Teacher.find({ isActive: true }).select('teacherName email role teacherId').sort({ teacherName: 1 }).lean();

    res.render("teacher/finance", {
      studentFeeRevenue,
      manualIncome,
      totalIncome,
      totalExpense,
      grossProfit,
      transactions,
      teachers,
      selectedMonth,
      academicMonths: ACADEMIC_MONTHS,
      monthlyBreakdown,
      currentAcademicYear: academicYear
    });
  } catch (err) {
    console.error("Finance render error:", err);
    renderError(req, res, 500, "Server Error");
  }
};

exports.addTransaction = async (req, res) => {
  try {
    const { type, category, amount, date, description, referenceId, staffName } = req.body;
    
    let finalDescription = description || "";
    if (category === "Salary" && staffName) {
      finalDescription = `Staff Salary: ${staffName}${description ? ' (' + description + ')' : ''}`;
    }
    
    const transaction = await Transaction.create({
      type,
      category,
      amount: Number(amount),
      date: date ? new Date(date) : new Date(),
      description: finalDescription,
      referenceId,
      addedBy: req.session.userId,
      academicYear: req.currentAcademicYear
    });

    await logAudit(req, {
      action: "CREATE",
      entityType: "Transaction",
      entityId: transaction._id,
      details: `Added ${type} transaction for ${category} (₹${amount})`,
      academicYear: req.currentAcademicYear
    });

    
    // Auto-send salary slip email if it's a salary payment
    if (category === 'Salary' && staffName) {
      try {
        const Teacher = require('../../models/Teacher');
        const { buildSalarySlipBuffer } = require('../../utils/pdf/salarySlipGenerator');
        const { sendEmail } = require('../../utils/emailService');
        const { MONTH_NAME_MAP_REVERSE } = (() => {
          const monthMap = { January:0, February:1, March:2, April:3, May:4, June:5, July:6, August:7, September:8, October:9, November:10, December:11 };
          return { MONTH_NAME_MAP_REVERSE: monthMap };
        })();

        const txnDate = date ? new Date(date) : new Date();
        const monthName = ['January','February','March','April','May','June','July','August','September','October','November','December'][txnDate.getMonth()];
        const txnYear = txnDate.getFullYear();

        const staffTeacher = await Teacher.findOne({ teacherName: { $regex: new RegExp(staffName.trim(), 'i') } }).lean();
        if (staffTeacher && staffTeacher.email) {
          const slipBuffer = await buildSalarySlipBuffer({
            teacher: staffTeacher,
            month: monthName,
            year: txnYear,
            amount: Number(amount),
            academicYear: req.currentAcademicYear,
            transactionId: transaction._id
          });

          await sendEmail(
            staffTeacher.email,
            `Salary Slip - ${monthName} ${txnYear} | Tuition Hub`,
            `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;background:#f9fafb;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
              <div style="background:linear-gradient(135deg,#4b2d84,#7c3aed);padding:28px 32px;text-align:center">
                <h2 style="color:white;margin:0;font-size:20px;letter-spacing:1px">💰 SALARY CREDITED</h2>
              </div>
              <div style="padding:28px 32px">
                <p style="color:#374151;font-size:14px">Dear <strong>${staffTeacher.teacherName}</strong>,</p>
                <p style="color:#374151;font-size:14px">Your salary for <strong>${monthName} ${txnYear}</strong> has been credited.</p>
                <div style="background:#ede9fe;border-radius:10px;padding:18px;text-align:center;margin:20px 0">
                  <div style="color:#6b7280;font-size:11px;font-family:monospace;letter-spacing:2px">AMOUNT CREDITED</div>
                  <div style="color:#4b2d84;font-size:32px;font-weight:900;margin-top:4px">₹${Number(amount).toLocaleString('en-IN')}</div>
                </div>
                <p style="color:#6b7280;font-size:12px">Your salary slip is attached to this email. Please find it below.</p>
                <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0"/>
                <p style="color:#9ca3af;font-size:11px;text-align:center">Tuition Hub Education Centre · Academic Year ${req.currentAcademicYear}</p>
              </div>
            </div>`,
            [{
              filename: `salary-slip-${staffTeacher.teacherName.toLowerCase().replace(/\s+/g,'-')}-${monthName}-${txnYear}.pdf`,
              content: slipBuffer,
              contentType: 'application/pdf'
            }],
            { emailType: 'SalarySlip' }
          );
          console.log(`Salary slip emailed to ${staffTeacher.email}`);
        }
      } catch (salaryEmailErr) {
        console.error('Salary slip email failed (non-critical):', salaryEmailErr.message);
      }
    }

    req.session.success = "Transaction added successfully!";
    res.redirect("/teacher/finance");
  } catch (err) {
    console.error("Error adding transaction:", err);
    req.session.error = "Failed to add transaction.";
    res.redirect("/teacher/finance");
  }
};

exports.deleteTransaction = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) { req.session.error = 'Transaction not found.'; return res.redirect('/teacher/finance'); }
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) {
      req.session.error = "Transaction not found.";
      return res.redirect("/teacher/finance");
    }

    await Transaction.findByIdAndDelete(req.params.id);

    await logAudit(req, {
      action: "DELETE",
      entityType: "Transaction",
      entityId: req.params.id,
      details: `Deleted ${transaction.type} transaction: ${transaction.category} (₹${transaction.amount})`,
      academicYear: req.currentAcademicYear
    });

    req.session.success = "Transaction deleted successfully!";
    res.redirect("/teacher/finance");
  } catch (err) {
    console.error("Error deleting transaction:", err);
    req.session.error = "Failed to delete transaction.";
    res.redirect("/teacher/finance");
  }
};

exports.renderSalaries = async (req, res) => {
  try {
    const academicYear = req.viewingYear;
    const yearBatches = await Batch.find({ academicYear }).distinct('_id');
    const paidFees = await Fee.find({ batch: { $in: yearBatches }, status: 'Paid' }).lean();
    const salaryTxns = await Transaction.find({ academicYear, type: 'EXPENSE', category: 'Salary' }).lean();
    const teachers = await Teacher.find({ isActive: true }).select('teacherName role teacherId').sort({ teacherName: 1 }).lean();

    const monthlyData = ACADEMIC_MONTHS.map(mName => {
      const feeRevenue = paidFees.filter(f => f.month === mName).reduce((s, f) => s + (f.amount || 0), 0);
      const teacherSalaries = {};
      let totalSalary = 0;
      teachers.forEach(t => {
        const sal = salaryTxns
          .filter(txn => MONTH_NAME_MAP[new Date(txn.date).getMonth()] === mName && txn.description && txn.description.toLowerCase().includes(t.teacherName.toLowerCase()))
          .reduce((s, txn) => s + (txn.amount || 0), 0);
        teacherSalaries[t.teacherId] = sal;
        totalSalary += sal;
      });
      return { month: mName, feeRevenue, teacherSalaries, totalSalary, balance: feeRevenue - totalSalary };
    });

    const totals = {
      feeRevenue: monthlyData.reduce((s, m) => s + m.feeRevenue, 0),
      totalSalary: monthlyData.reduce((s, m) => s + m.totalSalary, 0),
      balance: monthlyData.reduce((s, m) => s + m.balance, 0),
      teacherSalaries: {}
    };
    teachers.forEach(t => {
      totals.teacherSalaries[t.teacherId] = monthlyData.reduce((s, m) => s + (m.teacherSalaries[t.teacherId] || 0), 0);
    });

    res.render('teacher/salaries', { teachers, monthlyData, totals, currentAcademicYear: academicYear });
  } catch (err) {
    console.error('Salary render error:', err);
    renderError(req, res, 500, 'Server Error');
  }
};

exports.renderMySalary = async (req, res) => {
  try {
    const academicYear = req.viewingYear;
    const teacher = await Teacher.findById(req.session.userId).lean();
    if (!teacher) return renderError(req, res, 404, 'Staff not found');

    const salaryTxns = await Transaction.find({ academicYear, type: 'EXPENSE', category: 'Salary' }).lean();

    const monthlyData = ACADEMIC_MONTHS.map(mName => {
      const monthTxns = salaryTxns.filter(txn =>
        MONTH_NAME_MAP[new Date(txn.date).getMonth()] === mName &&
        txn.description && txn.description.toLowerCase().includes(teacher.teacherName.toLowerCase())
      );
      const salary = monthTxns.reduce((s, txn) => s + (txn.amount || 0), 0);
      const txnId = monthTxns.length > 0 ? monthTxns[0]._id : null;
      return { month: mName, salary, paid: salary > 0, txnId };
    });

    const totalPaid = monthlyData.reduce((s, m) => s + m.salary, 0);
    const monthsPaid = monthlyData.filter(m => m.paid).length;

    res.render('teacher/my_salary', { teacher, monthlyData, totalPaid, monthsPaid, currentAcademicYear: academicYear });
  } catch (err) {
    console.error('My salary render error:', err);
    renderError(req, res, 500, 'Server Error');
  }
};

exports.downloadSalarySlip = async (req, res) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) return renderError(req, res, 400, 'Month and year required');

    const academicYear = req.viewingYear;
    const teacher = await Teacher.findById(req.session.userId).lean();
    if (!teacher) return renderError(req, res, 404, 'Staff not found');

    const { buildSalarySlipBuffer } = require('../utils/pdf/salarySlipGenerator');

    const salaryTxns = await Transaction.find({ academicYear, type: 'EXPENSE', category: 'Salary' }).lean();
    const monthTxns = salaryTxns.filter(txn =>
      MONTH_NAME_MAP[new Date(txn.date).getMonth()] === month &&
      txn.description && txn.description.toLowerCase().includes(teacher.teacherName.toLowerCase())
    );

    if (monthTxns.length === 0) return renderError(req, res, 404, 'No salary record found for this month');

    const amount = monthTxns.reduce((s, t) => s + (t.amount || 0), 0);
    const txnId = monthTxns[0]._id;

    const slipBuffer = await buildSalarySlipBuffer({ teacher, month, year: Number(year), amount, academicYear, transactionId: txnId });

    const filename = `salary-slip-${teacher.teacherName.toLowerCase().replace(/\s+/g, '-')}-${month}-${year}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(slipBuffer);
  } catch (err) {
    console.error('Salary slip download error:', err);
    renderError(req, res, 500, 'Server Error');
  }
};
