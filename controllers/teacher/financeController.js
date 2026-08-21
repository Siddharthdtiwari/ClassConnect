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
