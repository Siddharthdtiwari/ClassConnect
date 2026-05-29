const mongoose = require("mongoose");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const User = require("../../models/User");
const Fee = require("../../models/Fee");
const { sendFeeReceipt } = require("../../utils/emailService");
const { generateReceiptPDF } = require("../../utils/pdfUtils");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

exports.renderFeePayment = async (req, res) => {
  try {
    const student = await User.findById(req.session.userId).populate('batch').lean();
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

    // Use batch's academic year if available (e.g. "2025-26"), otherwise fallback to current time
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

    res.render("student/fee_payment", {
      student,
      feesByMonth,
      totalDue,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error(err);
    res.send("Error loading fee payment");
  }
};

exports.createOrder = async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }
    const options = {
      amount: Math.round(amount * 100),
      currency: "INR",
      receipt: `receipt_order_${new Date().getTime()}`,
    };
    const order = await razorpay.orders.create(options);
    if (!order) {
      return res.status(500).send("Error creating order");
    }
    res.json(order);
  } catch (error) {
    console.error("Error in /create-order:", error);
    res.status(500).send("Server Error");
  }
};

exports.verifyPayment = async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;
  const secret = process.env.RAZORPAY_KEY_SECRET;

  const shasum = crypto.createHmac("sha256", secret);
  shasum.update(`${razorpay_order_id}|${razorpay_payment_id}`);
  const digest = shasum.digest("hex");

  if (digest === razorpay_signature) {
    console.log("Payment is legitimate and verified.");

    try {
      const student = await User.findById(req.session.userId).populate('batch');
      if (!student) {
        throw new Error("Student not found for session.");
      }

      const alreadyProcessed = await Fee.findOne({
        razorpay_payment_id: razorpay_payment_id,
        batch: student.batch._id,
      });
      if (alreadyProcessed) {
        console.log(`Payment ${razorpay_payment_id} already recorded — skipping duplicate.`);
        return res.json({ status: "success", orderId: razorpay_order_id, paymentId: razorpay_payment_id });
      }

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
      const monthsElapsed = now.getDate() >= FEE_DUE_DAY ? currentAcademicIndex + 1 : currentAcademicIndex;

      const paidFees = await Fee.find({
        studentId: student.studentId,
        batch: student.batch._id,
      }).lean();
      const paidMonths = paidFees.map((f) => f.month);
      const monthlyFee = student.monthlyFee || 1;
      const amountPaid = parseInt(amount);
      const monthsCount = Math.max(1, Math.floor(amountPaid / monthlyFee));

      const dueMonths = [];
      for (let i = 0; i < monthsElapsed && dueMonths.length < monthsCount; i++) {
        const monthToCheck = months[i];
        if (!paidMonths.includes(monthToCheck)) {
          dueMonths.push(monthToCheck);
        }
      }

      if (dueMonths.length === 0) {
        dueMonths.push(months[calendarToAcademic[now.getMonth()]]);
      }

      let academicStartYear;
      if (student.batch && student.batch.academicYear) {
        academicStartYear = parseInt(student.batch.academicYear.split("-")[0]);
      } else {
        academicStartYear = currentMonthIndex >= 4 ? now.getFullYear() : now.getFullYear() - 1;
      }
      const yearForMonthIndex = (idx) => idx < 8 ? academicStartYear : academicStartYear + 1;
      const perMonthAmount = Math.floor(amountPaid / dueMonths.length);

      for (let i = 0; i < dueMonths.length; i++) {
        const dueMonth = dueMonths[i];
        const monthIdx = months.indexOf(dueMonth);
        const feeYear = yearForMonthIndex(monthIdx);
        
        const feeData = {
          studentId: student.studentId,
          studentName: student.studentName,
          studentEmail: student.email || "",
          userRef: student._id,
          month: dueMonth,
          year: feeYear,
          amount: perMonthAmount,
          method: "Razorpay",
          status: "Paid",
          datePaid: new Date(),
          batch: student.batch ? student.batch._id : null,
        };
        
        feeData.razorpay_payment_id = dueMonths.length > 1 ? `${razorpay_payment_id}-${i + 1}` : razorpay_payment_id;
        
        const newFee = new Fee(feeData);
        const savedFee = await newFee.save();
        console.log(`Fee record created for ${dueMonth} — payment ID: ${razorpay_payment_id}`);
        
        if (student.email) {
          sendFeeReceipt(student.email, student.studentName, dueMonth, feeYear, perMonthAmount, {
            fee: savedFee.toObject(),
            student: student,
          })
            .catch(err => console.error("Fee receipt email failed:", err));
        }
      }
    } catch (dbError) {
      console.error("Error saving fee to DB after payment verification:", dbError);
    }

    res.json({
      status: "success",
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
    });
  } else {
    res.status(400).json({ status: "failure", message: "Invalid signature." });
  }
};

exports.downloadReceipt = async (req, res) => {
  try {
    const fee = await Fee.findById(req.params.feeId).lean();
    if (!fee) return res.send("Receipt not found");
    const student = fee.userRef
      ? await User.findById(fee.userRef).populate('batch').lean()
      : await User.findOne({ studentId: fee.studentId, batch: fee.batch }).populate('batch').lean();
    await generateReceiptPDF(fee, student, res, "attachment");
  } catch (err) {
    console.error(err);
    res.send("Error generating receipt");
  }
};

exports.viewReceipt = async (req, res) => {
  try {
    const fee = await Fee.findById(req.params.feeId).lean();
    if (!fee) return res.send("Receipt not found");
    const student = fee.userRef
      ? await User.findById(fee.userRef).populate('batch').lean()
      : await User.findOne({ studentId: fee.studentId, batch: fee.batch }).populate('batch').lean();
    await generateReceiptPDF(fee, student, res, "inline");
  } catch (err) {
    console.error(err);
    res.send("Error generating receipt");
  }
};
