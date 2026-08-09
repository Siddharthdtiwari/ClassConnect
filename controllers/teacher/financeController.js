const Transaction = require("../../models/Transaction");
const Fee = require("../../models/Fee");
const Batch = require("../../models/Batch");
const { logAudit } = require("../../utils/auditService");

exports.renderFinance = async (req, res) => {
  try {
    const academicYear = req.viewingYear;
    
    // 1. Get total student fees
    const yearBatches = await Batch.find({ academicYear }).distinct('_id');
    const feeAggregation = await Fee.aggregate([
      { $match: { batch: { $in: yearBatches }, status: 'Paid' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const studentFeeRevenue = feeAggregation.length > 0 ? feeAggregation[0].total : 0;

    // 2. Get manual transactions
    const transactions = await Transaction.find({ academicYear }).sort({ date: -1 }).lean();
    
    let manualIncome = 0;
    let totalExpense = 0;

    transactions.forEach(t => {
      if (t.type === 'INCOME') manualIncome += t.amount;
      else if (t.type === 'EXPENSE') totalExpense += t.amount;
    });

    const totalIncome = studentFeeRevenue + manualIncome;
    const grossProfit = totalIncome - totalExpense;

    res.render("teacher/finance", {
      studentFeeRevenue,
      manualIncome,
      totalIncome,
      totalExpense,
      grossProfit,
      transactions,
      currentAcademicYear: academicYear
    });
  } catch (err) {
    console.error("Finance render error:", err);
    res.status(500).send("Server Error");
  }
};

exports.addTransaction = async (req, res) => {
  try {
    const { type, category, amount, date, description, referenceId } = req.body;
    
    const transaction = await Transaction.create({
      type,
      category,
      amount: Number(amount),
      date: date ? new Date(date) : new Date(),
      description,
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
    const transaction = await Transaction.findByIdAndDelete(req.params.id);
    if (transaction) {
      await logAudit(req, {
        action: "DELETE",
        entityType: "Transaction",
        entityId: transaction._id,
        details: `Deleted ${transaction.type} transaction for ${transaction.category} (₹${transaction.amount})`,
        academicYear: req.currentAcademicYear
      });
      req.session.success = "Transaction deleted successfully!";
    }
    res.redirect("/teacher/finance");
  } catch (err) {
    console.error("Error deleting transaction:", err);
    req.session.error = "Failed to delete transaction.";
    res.redirect("/teacher/finance");
  }
};
