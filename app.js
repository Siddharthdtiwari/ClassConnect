const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const bcrypt = require("bcrypt");
const multer = require("multer");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const archiver = require("archiver");
require("dotenv").config();

const User = require("./models/user");
const Teacher = require("./models/teacher");
const Test = require("./models/test");
const Score = require("./models/score");
const Fee = require("./models/fee");
const Attendance = require("./models/attendance");
const StudyMaterial = require("./models/StudyMaterial");
const ExamTimetable = require("./models/examTimetable");

const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
    cookie: { maxAge: 1000 * 60 * 60, httpOnly: true, sameSite: "strict" },
  })
);

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const storage = multer.memoryStorage();

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Invalid file type "${file.mimetype}". Only JPEG, PNG, WebP, and PDF are allowed.`
        ),
        false
      );
    }
  },
});

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadToCloudinary = (fileBuffer, folder = "student-profiles") =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "auto" },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    streamifier.createReadStream(fileBuffer).pipe(stream);
  });

async function connectDB() {
  if (mongoose.connection.readyState === 1) {
    return;
  }

  const options = {
    serverSelectionTimeoutMS: 5000,
  };

  try {
    await mongoose.connect(process.env.MONGODB_URI, options);
    console.log("MongoDB connection established.");
  } catch (err) {
    console.error("MongoDB Connection Error:", err);
    throw err;
  }
}

const ensureDBConnection = async (req, res, next) => {
  if (mongoose.connection.readyState === 1) {
    return next();
  }

  try {
    await connectDB();
    next();
  } catch (err) {
    console.error("Failed to establish DB connection for request:", err);
    res
      .status(503)
      .send(
        "Service Unavailable: Database Connection Error. Please check the MongoDB server."
      );
  }
};

const requireTeacherLogin = (req, res, next) => {
  if (!req.session.userId || req.session.role !== "teacher")
    return res.redirect("/teacher/login");
  next();
};

const requireStudentLogin = async (req, res, next) => {
  if (!req.session.userId || req.session.role !== "student")
    return res.redirect("/student/login");

  try {
    const student = await User.findById(req.session.userId).lean();
    if (!student) return res.redirect("/student/login");

    req.user = student;
    next();
  } catch (err) {
    console.error("Middleware error:", err);
    res.redirect("/student/login");
  }
};

app.get("/", (req, res) => res.render("index"));

// =====================
//     Student Routes
// =====================
app.get("/student/login", (req, res) => res.render("student/login"));
app.post("/student/login", ensureDBConnection, async (req, res) => {
  try {
    const { studentId, password } = req.body;
    const student = await User.findOne({ studentId });
    if (!student)
      return res.render("student/login", { error: "Invalid ID or password" });

    const validPassword = await bcrypt.compare(password, student.password);
    if (validPassword) {
      req.session.userId = student._id;
      req.session.role = "student";
      res.redirect("/student/dashboard");
    } else {
      res.render("student/login", { error: "Invalid ID or password" });
    }
  } catch (err) {
    console.error("Login error:", err);
    res.render("student/login", { error: "Server error. Try again." });
  }
});

app.get(
  "/student/dashboard",
  ensureDBConnection,
  requireStudentLogin,
  async (req, res) => {
    try {
      const student = await User.findById(req.session.userId).lean();
      if (!student) return res.redirect("/student/login");


      const studentId = student.studentId;

      const recentFees = await Fee.find({ studentId: studentId, status: "Paid" })
        .sort({ datePaid: -1 })
        .limit(6)
        .lean();

      const recentScores = await Score.find({ studentId: studentId })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('testId', 'testDate totalMarks subject')
        .lean();

      const allAttendanceRecords = await Attendance.find({
        "records.studentId": studentId,
      }).lean();

      let presentDays = 0;
      let absentDays = 0;
      let totalDays = 0;

      allAttendanceRecords.forEach((dayRecord) => {
        totalDays++;
        const record = dayRecord.records.find((r) => r.studentId === studentId);
        if (record && record.status === "P") {
          presentDays++;
        }
        if (record && record.status === "A") {
          absentDays++;
        }
      });

      const attendancePercentage =
        (presentDays + absentDays) > 0 ? ((presentDays / (presentDays + absentDays)) * 100).toFixed(1) : 0;

      const scoreLabels = recentScores.map((score) => score.testName).reverse();
      const scoreData = recentScores.map((score) => score.percentage).reverse();

      const allStudents = await User.find({})
        .sort({ points: -1 })
        .lean();

      let studentRank = "-";
      const rankIndex = allStudents.findIndex(s => s._id.toString() === student._id.toString());
      if (rankIndex !== -1) {
        studentRank = rankIndex + 1;
      }

      res.render("student/dashboard", {
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
      console.error(err);
      res.status(500).send("Error loading dashboard");
    }
  }
);

app.get(
  "/student/report",
  ensureDBConnection,
  requireStudentLogin,
  async (req, res) => {
    try {
      const student = await User.findById(req.session.userId).lean();
      if (!student) return res.redirect("/student/login");

      const studentId = student.studentId;

      const recentFees = await Fee.find({ studentId: studentId, status: "Paid" })
        .sort({ datePaid: 1 })
        .lean();

      const recentScores = await Score.find({ studentId: studentId })
        .populate("testId", "subject")
        .sort({ createdAt: 1 })
        .lean();

      const allAttendanceRecords = await Attendance.find({
        "records.studentId": studentId,
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

      const attendancePercentage =
        totalDays > 0 ? ((presentDays / (presentDays + absentDays)) * 100).toFixed(1) : 0;

      const allStudents = await User.find({})
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
        { setHeaders: true }
      );
    } catch (err) {
      console.error("Error generating student report:", err);
      if (!res.headersSent) {
        res.status(500).send("Server Error");
      }
    }
  }
);

app.get(
  "/student/edit_profile",
  ensureDBConnection,
  requireStudentLogin,
  async (req, res) => {
    try {
      const student = await User.findById(req.session.userId).lean();
      if (!student) return res.redirect("/student/login");

      res.render("student/edit_profile", { student });
    } catch (err) {
      console.error(err);
      res.status(500).send("Error loading edit profile page");
    }
  }
);

app.post(
  "/student/edit_profile",
  ensureDBConnection,
  requireStudentLogin,
  upload.single("profilePhoto"),
  async (req, res) => {
    try {
      const updates = {
        studentName: req.body.studentName,
        mobileNo: req.body.mobileNo,
      };

      if (req.file) {
        const result = await uploadToCloudinary(
          req.file.buffer,
          "student-profiles"
        );
        updates.profilePhoto = result.secure_url;
      }

      await User.findByIdAndUpdate(req.session.userId, updates, { new: true });
      res.redirect("/student/dashboard");
    } catch (err) {
      console.error(err);
      res.status(500).send("Error updating profile");
    }
  }
);

app.get(
  "/student/attendance",
  ensureDBConnection,
  requireStudentLogin,
  async (req, res) => {
    try {
      const student = await User.findById(req.session.userId).lean();
      if (!student) return res.status(404).send("Student not found");

      const studentId = student.studentId;
      const attendanceDocs = await Attendance.find().lean();

      const attendanceData = { overall: {} };

      attendanceDocs.forEach((doc) => {
        const studentRecord = doc.records.find(
          (r) => r.studentId === studentId
        );

        if (studentRecord) {
          let status;
          if (studentRecord.status === "P") status = "present";
          else if (studentRecord.status === "A") status = "absent";
          else if (studentRecord.status === "H") status = "holiday";

          const dateObj = new Date(doc.date);
          const year = dateObj.getFullYear();
          const month = String(dateObj.getMonth() + 1).padStart(2, "0");
          const day = String(dateObj.getDate()).padStart(2, "0");
          const formatted = `${year}-${month}-${day}`;

          attendanceData.overall[formatted] = status;
        }
      });
      res.render("student/attendance", { student, attendanceData });
    } catch (err) {
      console.error(err);
      res.status(500).send("Error fetching attendance");
    }
  }
);

app.get(
  "/student/test_score",
  ensureDBConnection,
  requireStudentLogin,
  async (req, res) => {
    try {
      const studentId = req.user.studentId;

      const scores = await Score.find({ studentId }).populate("testId").lean();

      const scoresBySubject = {};
      scores.forEach((score) => {
        const subject = score.testId?.subject || "Unknown";
        if (!scoresBySubject[subject]) scoresBySubject[subject] = [];
        scoresBySubject[subject].push({
          testName: score.testName,
          topic: score.testId?.topic || "No topic",
          score: score.score,
          percentage: score.percentage,
          subject: score.testId?.subject,
          total: score.testId?.totalMarks || 100,
          questionPaper: score.testId?.questionPaper || "",
        });
      });
      res.render("student/test_score", { scoresBySubject });
    } catch (err) {
      console.error(err);
      res.status(500).send("Error fetching scores");
    }
  }
);

app.get(
  "/student/fee_payment",
  ensureDBConnection,
  requireStudentLogin,
  async (req, res) => {
    try {
      const student = await User.findById(req.session.userId).lean();
      if (!student) return res.send("Student not found");

      const months = [
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
        "January",
        "February",
        "March",
        "April",
      ];

      const calendarToAcademic = {
        4: 0,
        5: 1,
        6: 2,
        7: 3,
        8: 4,
        9: 5,
        10: 6,
        11: 7,
        0: 8,
        1: 9,
        2: 10,
        3: 11,
      };

      const now = new Date();
      const currentMonthIndex = now.getMonth();
      const currentAcademicIndex = calendarToAcademic[currentMonthIndex];
      // Fees for the current month become Due only on/after the 10th.
      // Before the 10th, only previous months are counted as due.
      const FEE_DUE_DAY = 10;
      const monthsElapsed =
        now.getDate() >= FEE_DUE_DAY
          ? currentAcademicIndex + 1   // current month is now due
          : currentAcademicIndex;       // current month not yet due

      const academicStartYear =
        currentMonthIndex >= 4 ? now.getFullYear() : now.getFullYear() - 1;
      const yearForMonthIndex = (idx) =>
        idx < 8 ? academicStartYear : academicStartYear + 1;

      const fees = await Fee.find({ studentId: student.studentId }).lean();

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
      const dueMonthsCount = feesByMonth.filter(
        (f) => f.status === "Due"
      ).length;
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
  }
);

app.post(
  "/create-order",
  ensureDBConnection,
  requireStudentLogin,
  async (req, res) => {
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
  }
);

app.post(
  "/verify-payment",
  ensureDBConnection,
  requireStudentLogin,
  async (req, res) => {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      amount,
    } = req.body;
    const secret = process.env.RAZORPAY_KEY_SECRET;

    const shasum = crypto.createHmac("sha256", secret);
    shasum.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const digest = shasum.digest("hex");

    if (digest === razorpay_signature) {
      console.log("Payment is legitimate and verified.");

      try {
        const alreadyProcessed = await Fee.findOne({
          razorpay_payment_id: razorpay_payment_id,
        });
        if (alreadyProcessed) {
          console.log(
            `Payment ${razorpay_payment_id} already recorded — skipping duplicate.`
          );
          return res.json({
            status: "success",
            orderId: razorpay_order_id,
            paymentId: razorpay_payment_id,
          });
        }

        const student = await User.findById(req.session.userId);
        if (!student) {
          throw new Error("Student not found for session.");
        }

        const months = [
          "May",
          "June",
          "July",
          "August",
          "September",
          "October",
          "November",
          "December",
          "January",
          "February",
          "March",
          "April",
        ];
        const calendarToAcademic = {
          4: 0,
          5: 1,
          6: 2,
          7: 3,
          8: 4,
          9: 5,
          10: 6,
          11: 7,
          0: 8,
          1: 9,
          2: 10,
          3: 11,
        };

        const now = new Date();
        const currentMonthIndex = now.getMonth();
        const currentAcademicIndex = calendarToAcademic[currentMonthIndex];
        const FEE_DUE_DAY = 10;
        const monthsElapsed =
          now.getDate() >= FEE_DUE_DAY
            ? currentAcademicIndex + 1
            : currentAcademicIndex;

        const paidFees = await Fee.find({
          studentId: student.studentId,
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

        const year = now.getFullYear();
        const perMonthAmount = Math.floor(amountPaid / dueMonths.length);

        for (let i = 0; i < dueMonths.length; i++) {
          const dueMonth = dueMonths[i];
          const feeData = {
            studentId: student.studentId,
            studentName: student.studentName,
            standard: student.standard,
            month: dueMonth,
            year: year,
            amount: perMonthAmount,
            method: "Razorpay",
            status: "Paid",
            datePaid: new Date(),
          };
          // Single-month payment → plain ID. Multi-month payment → every
          // record gets "-1", "-2", … so you can immediately tell it was
          // a bulk payment just by looking at any record.
          feeData.razorpay_payment_id =
            dueMonths.length > 1
              ? `${razorpay_payment_id}-${i + 1}`
              : razorpay_payment_id;
          const newFee = new Fee(feeData);
          await newFee.save();
          console.log(`Fee record created for ${dueMonth} — payment ID: ${razorpay_payment_id}`);
        }
      } catch (dbError) {
        console.error(
          "Error saving fee to DB after payment verification:",
          dbError
        );
      }

      res.json({
        status: "success",
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
      });
    } else {
      res
        .status(400)
        .json({ status: "failure", message: "Invalid signature." });
    }
  }
);

app.get(
  "/student/take_test",
  ensureDBConnection,
  requireStudentLogin,
  async (req, res) => {
    try {
      const studentStandard = req.user.standard;
      const subject = req.query.subject || "overall";
      let query = { standard: studentStandard };
      if (subject !== "overall") {
        query.subject = subject;
      }
      const tests = await Test.find(query).lean();
      res.render("student/take_test", { tests, studentStandard, subject });
    } catch (err) {
      console.error(err);
      res.status(500).send("Error loading tests");
    }
  }
);

const PDFDocument = require("pdfkit");
const axios = require("axios");

async function generateReceiptPDF(fee, student, res, disposition) {
  const doc = new PDFDocument({ size: "A4", margin: 0 });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `${disposition}; filename=receipt-${fee._id}.pdf`
  );
  doc.pipe(res);

  const W = doc.page.width;
  const M = 50;

  let headerHeight = 0;
  const headerUrl = process.env.CLOUDINARY_HEADER_URL;

  if (headerUrl) {
    try {
      const response = await axios.get(headerUrl, { responseType: "arraybuffer" });
      const imgBuffer = Buffer.from(response.data, "binary");
      doc.rect(0, 0, W, 105).stroke("#d1d5db");
      doc.image(imgBuffer, 0, 0, { width: W, fit: [W, 105] });
      headerHeight = 105;
    } catch (_) {
      doc.rect(0, 0, W, 110).fill("#4b2d84");
      headerHeight = 110;
    }
  } else {
    doc.rect(0, 0, W, 110).fill("#4b2d84");
    doc.fillColor("white").font("Times-Bold").fontSize(22)
      .text("PAYMENT RECEIPT", M, 36, { width: W - M * 2, align: "center" });
    doc.fillColor("rgba(255,255,255,0.7)").font("Times-Roman").fontSize(10)
      .text("TUITION HUB EDUCATION CENTRE", M, 66, { width: W - M * 2, align: "center" });
    headerHeight = 110;
  }

  doc.rect(0, headerHeight, W, 4).fill("#4b2d84");

  const titleY = headerHeight + 14;
  doc.fillColor("#4b2d84").font("Times-Bold").fontSize(18)
    .text("PAYMENT RECEIPT", M, titleY, { width: W - M * 2, align: "center" });

  const titleUnderlineY = titleY + 28;
  doc.rect(W / 2 - 80, titleUnderlineY, 160, 2).fill("#7c52ca");


  const metaY = titleUnderlineY + 12;
  doc.fillColor("#6b7280").font("Times-Roman").fontSize(9)
    .text(`Receipt ID: ${fee._id}`, M, metaY, { align: "right", width: W - M * 2 });
  doc.fillColor("#6b7280").fontSize(9)
    .text(`Generated: ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}`, M, metaY + 14, { align: "right", width: W - M * 2 });

  const stuY = metaY + 42;
  doc.rect(M, stuY, W - M * 2, 80).fill("#f5f3ff").stroke("#e9d5ff");

  doc.fillColor("#4b2d84").font("Times-Bold").fontSize(11)
    .text("BILLED TO", M + 16, stuY + 12);

  doc.fillColor("#1f2937").font("Times-Bold").fontSize(13)
    .text(student.studentName, M + 16, stuY + 28);

  doc.fillColor("#6b7280").font("Times-Roman").fontSize(10)
    .text(`Student ID: ${student.studentId}   •   Class: ${student.standard}`, M + 16, stuY + 48);

  const tableY = stuY + 100;
  const col1 = M;
  const col2 = M + 260;
  const rowH = 36;

  const rows = [
    ["Month", `${fee.month} ${fee.year}`],
    ["Amount Paid", `Rs. ${Number(fee.amount).toLocaleString("en-IN")}`],
    ["Date Paid", new Date(fee.datePaid).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })],
    ["Payment Method", fee.method],
    ["Status", fee.status],
  ];

  doc.rect(col1, tableY, W - M * 2, rowH).fill("#4b2d84");
  doc.fillColor("white").font("Times-Bold").fontSize(10)
    .text("DESCRIPTION", col1 + 14, tableY + 11)
    .text("DETAILS", col2, tableY + 11);

  rows.forEach((row, i) => {
    const y = tableY + rowH + i * rowH;
    const bg = i % 2 === 0 ? "#ffffff" : "#faf5ff";
    doc.rect(col1, y, W - M * 2, rowH).fill(bg).stroke("#e5e7eb");

    doc.fillColor("#374151").font("Times-Roman").fontSize(10)
      .text(row[0], col1 + 14, y + 11);

    const isStatus = row[0] === "Status";
    if (isStatus) {
      doc.rect(col2, y + 7, 52, 18).fill("#d1fae5").stroke("#6ee7b7");
      doc.fillColor("#065f46").font("Times-Bold").fontSize(10)
        .text(row[1], col2 + 6, y + 11);
    } else {
      doc.fillColor("#111827").font("Times-Bold").fontSize(10)
        .text(row[1], col2, y + 11);
    }
  });

  const totalY = tableY + rowH + rows.length * rowH;
  doc.rect(col1, totalY, W - M * 2, rowH + 4).fill("#4b2d84");
  doc.fillColor("white").font("Times-Bold").fontSize(11)
    .text("TOTAL PAID", col1 + 14, totalY + 12)
    .text(`Rs. ${Number(fee.amount).toLocaleString("en-IN")}`, col2, totalY + 12);

  const footerY = totalY + rowH + 20;
  doc.rect(0, footerY + 40, W, 2).fill("#e9d5ff");

  doc.fillColor("#9ca3af").font("Times-Italic").fontSize(9)
    .text("This is a computer-generated receipt and does not require a signature.", M, footerY + 50, { align: "center", width: W - M * 2 });

  doc.fillColor("#6b7280").font("Times-Roman").fontSize(9)
    .text("TUITION HUB Education Centre  •  Andheri (East), Mumbai 400059  •  9967466955", M, footerY + 66, { align: "center", width: W - M * 2 });

  doc.end();
}

app.get(
  "/student/receipt/:feeId",
  ensureDBConnection,
  requireStudentLogin,
  async (req, res) => {
    try {
      const fee = await Fee.findById(req.params.feeId).lean();
      if (!fee) return res.send("Receipt not found");
      const student = await User.findOne({ studentId: fee.studentId }).lean();
      await generateReceiptPDF(fee, student, res, "attachment");
    } catch (err) {
      console.error(err);
      res.send("Error generating receipt");
    }
  }
);

app.get(
  "/student/receipt/:feeId/view",
  ensureDBConnection,
  requireStudentLogin,
  async (req, res) => {
    try {
      const fee = await Fee.findById(req.params.feeId).lean();
      if (!fee) return res.send("Receipt not found");
      const student = await User.findOne({ studentId: fee.studentId }).lean();
      await generateReceiptPDF(fee, student, res, "inline");
    } catch (err) {
      console.error(err);
      res.send("Error generating receipt");
    }
  }
);


app.get(
  "/student/content",
  ensureDBConnection,
  requireStudentLogin,
  async (req, res) => {
    try {
      const student = await User.findById(req.session.userId).lean();
      if (!student) return res.status(404).send("Student not found");

      const [materials, tests] = await Promise.all([
        StudyMaterial.find({ standard: student.standard })
          .sort({ uploadedAt: -1 })
          .lean(),
        Test.find({ standard: student.standard })
          .sort({ createdAt: -1 })
          .lean(),
      ]);

      res.render("student/content", { student, materials, tests });
    } catch (err) {
      console.error(err);
      res.status(500).send("Error loading class content");
    }
  }
);

app.get(
  "/student/leader_board",
  ensureDBConnection,
  requireStudentLogin,
  async (req, res) => {
    try {
      const students = await User.find().lean();
      students.forEach((s) => {
        if (typeof s.points !== "number") s.points = 0;
      });
      students.sort((a, b) => b.points - a.points);

      const leaderboard = students.map((s, index) => ({
        rank: index + 1,
        name: s.studentName,
        studentId: s.studentId,
        score: s.points,
        avatar:
          s.profilePhoto ||
          s.studentName
            .split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase(),
      }));

      const topThree = leaderboard.slice(0, 3);
      const rest = leaderboard.slice(3);

      const currentStudent = await User.findById(req.session.userId).lean();
      const currentUser = currentStudent.studentName;

      res.render("student/leader_board", { topThree, rest, currentUser });
    } catch (err) {
      console.error(err);
      res.status(500).send("Error fetching leaderboard");
    }
  }
);

app.get("/student/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout error:", err);
      return res.status(500).send("Logout failed");
    }
    res.redirect("/");
  });
});

// =====================
//     Teacher Routes
// =====================
app.get("/teacher/login", (req, res) => {
  res.render("teacher/login");
});

app.post("/teacher/login", ensureDBConnection, async (req, res) => {
  try {
    const { teacherId, password } = req.body;
    const teacher = await Teacher.findOne({ teacherId });

    if (!teacher) {
      return res.render("teacher/login", { error: "Invalid ID or password" });
    }

    const validPassword = await bcrypt.compare(password, teacher.password);
    if (validPassword) {
      req.session.userId = teacher._id;
      req.session.role = "teacher";
      return res.redirect("/teacher/dashboard");
    } else {
      return res.render("teacher/login", { error: "Invalid ID or password" });
    }
  } catch (err) {
    console.error("Login error:", err);
    res.render("teacher/login", { error: "Server error. Try again." });
  }
});

app.get(
  "/teacher/dashboard",
  ensureDBConnection,
  requireTeacherLogin,
  async (req, res) => {
    try {
      const teacher = await Teacher.findById(req.session.userId);
      if (!teacher) return res.redirect("/teacher/login");
      res.render("teacher/dashboard", { teacher });
    } catch (err) {
      console.error("Teacher dashboard error:", err);
      res.status(500).send("Error loading dashboard");
    }
  }
);

app.get("/teacher/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout error:", err);
      return res.status(500).send("Logout failed");
    }
    res.redirect("/");
  });
});

app.get(
  "/teacher/add_teacher",
  ensureDBConnection,
  requireTeacherLogin,
  (req, res) => res.render("teacher/add_teacher")
);

app.post(
  "/teacher/add_teacher",
  ensureDBConnection,
  requireTeacherLogin,
  async (req, res) => {
    try {
      const { teacherId, teacherName, email, subjects, password } = req.body;
      const hashedPassword = await bcrypt.hash(password, 12);

      const newTeacher = new Teacher({
        teacherId,
        teacherName,
        email,
        subjects,
        password: hashedPassword,
      });
      await newTeacher.save();
      res.send("Teacher added successfully!");
    } catch (err) {
      console.error(err);
      if (err.code === 11000) res.status(400).send("Teacher ID already exists");
      else res.status(500).send("Failed to add teacher");
    }
  }
);

app.get(
  "/teacher/edit_teacher/:id",
  ensureDBConnection,
  requireTeacherLogin,
  async (req, res) => {
    const teacher = await Teacher.findById(req.params.id).lean();
    if (!teacher) return res.status(404).send("Teacher not found");
    res.render("teacher/edit_teacher", { teacher });
  }
);

app.post(
  "/teacher/edit_teacher/:id",
  ensureDBConnection,
  requireTeacherLogin,
  async (req, res) => {
    const { teacherName, email, subjects, password } = req.body;
    const updateData = { teacherName, email, subjects };
    if (password && password.trim() !== "")
      updateData.password = await bcrypt.hash(password, 12);
    await Teacher.findByIdAndUpdate(req.params.id, updateData);
    res.redirect(`/teacher/edit_teacher/${req.params.id}`);
  }
);

app.get(
  "/teacher/manage_students",
  ensureDBConnection,
  requireTeacherLogin,
  async (req, res) => {
    const students = await User.find().lean();
    res.render("teacher/manage_students", { students });
  }
);

app.get(
  "/teacher/bulk_add_students",
  ensureDBConnection,
  requireTeacherLogin,
  async (req, res) => {
    const studentsRaw = await User.find({}).lean();
    const students = studentsRaw.sort((a, b) => {
      const stdDiff = Number(a.standard) - Number(b.standard);
      if (stdDiff !== 0) return stdDiff;
      return String(a.studentId).localeCompare(String(b.studentId), undefined, { numeric: true });
    });
    res.render("teacher/bulk_add_students", { students });
  }
);

app.post(
  "/teacher/bulk_save_students",
  ensureDBConnection,
  requireTeacherLogin,
  express.json(),
  async (req, res) => {
    try {
      const studentsData = req.body;
      if (!Array.isArray(studentsData) || studentsData.length === 0) {
        return res.status(400).json({ error: "Invalid or empty data provided." });
      }

      const bulkOps = [];
      const errors = [];
      let processed = 0;

      for (let i = 0; i < studentsData.length; i++) {
        const row = studentsData[i];

        if (!row.studentName || !row.studentId || !row.standard || !row.mobileNo) {
          errors.push(`Row ${i + 1}: Missing required fields (Name, ID, Standard, or Mobile).`);
          continue;
        }

        const updateDoc = {
          studentName: row.studentName,
          studentId: row.studentId,
          standard: row.standard,
          mobileNo: row.mobileNo,
          monthlyFee: row.monthlyFee || 0,
        };

        if (row.password && String(row.password).trim() !== "") {
          updateDoc.password = await bcrypt.hash(String(row.password).trim(), 12);
        } else {
          const existing = await User.findOne({ studentId: row.studentId });
          if (!existing) {
            updateDoc.password = await bcrypt.hash(String(row.mobileNo).trim(), 12);
          }
        }

        bulkOps.push({
          updateOne: {
            filter: { studentId: row.studentId },
            update: { $set: updateDoc },
            upsert: true
          }
        });
        processed++;
      }

      if (bulkOps.length > 0) {
        await User.bulkWrite(bulkOps);
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
  }
);

app.get(
  "/teacher/add_student",
  ensureDBConnection,
  requireTeacherLogin,
  (req, res) => res.render("teacher/add_student")
);

app.post(
  "/teacher/add_student",
  ensureDBConnection,
  requireTeacherLogin,
  upload.single("profilePhoto"),
  async (req, res) => {
    try {
      const {
        standard,
        studentId,
        studentName,
        password,
        mobileNo,
        monthlyFee,
      } = req.body;
      const hashedPassword = await bcrypt.hash(password, 12);

      let profilePhotoUrl = null;
      if (req.file) {
        const result = await uploadToCloudinary(
          req.file.buffer,
          "student-profiles"
        );
        profilePhotoUrl = result.secure_url;
      }

      const newStudent = new User({
        standard,
        studentId,
        studentName,
        password: hashedPassword,
        mobileNo,
        monthlyFee,
        profilePhoto: profilePhotoUrl,
      });
      await newStudent.save();
      res.send("Student added successfully!");
    } catch (err) {
      console.error(err);
      res.status(500).send("Failed to add student");
    }
  }
);

app.get(
  "/teacher/view_profile/:id",
  ensureDBConnection,
  requireTeacherLogin,
  async (req, res) => {
    try {
      const student = await User.findById(req.params.id).lean();
      if (!student) return res.status(404).send("Student not found");

      const studentId = student.studentId;

      const recentFees = await Fee.find({ studentId: studentId, status: "Paid" })
        .sort({ datePaid: -1 })
        .lean();

      const recentScores = await Score.find({ studentId: studentId })
        .sort({ createdAt: -1 })
        .lean();

      const allAttendanceRecords = await Attendance.find({
        "records.studentId": studentId,
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

      const attendancePercentage =
        totalDays > 0 ? ((presentDays / (presentDays + absentDays)) * 100).toFixed(1) : 0;

      const scoreLabels = recentScores.slice(0, 10).map((score) => score.testName).reverse();
      const scoreData = recentScores.slice(0, 10).map((score) => score.percentage).reverse();

      const allStudents = await User.find({})
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
  }
);

async function drawStudentReport(doc, student, stats) {
  const W = doc.page.width;
  const H = doc.page.height;
  const M = 40;

  function drawWatermark() {
    doc.save();
    doc.fillOpacity(0.1);
    doc.fillColor("#4b2d84");
    doc.font("Times-Bold").fontSize(10);

    const watermarkText = `TUITION HUB EDU CENTER - ${student.studentName.toUpperCase()} (${student.studentId})    `;
    const stepX = 180;
    const stepY = 80;

    for (let y = -50; y < doc.page.height + 100; y += stepY) {
      for (let x = -50; x < doc.page.width + 100; x += stepX) {
        doc.save();
        doc.translate(x, y);
        doc.rotate(-30);
        doc.text(watermarkText, 0, 0);
        doc.restore();
      }
    }
    doc.restore();
  }

  // Background color for the whole page
  doc.rect(0, 0, W, H).fill("#fafafa");
  drawWatermark();

  const primaryGrad = doc.linearGradient(0, 0, W, 120);
  primaryGrad.stop(0, "#4b2d84").stop(1, "#6b46c1");

  // Header
  let headerHeight = 150;

  doc.rect(0, 0, W, headerHeight).fill(primaryGrad);

  doc.save();
  doc.fillOpacity(0.1);
  doc.circle(W - 40, 40, 80).fill("white");
  doc.circle(W - 80, 100, 50).fill("white");
  doc.circle(40, 20, 60).fill("white");
  doc.restore();

  const headerUrl = process.env.CLOUDINARY_HEADER_URL;

  if (headerUrl) {
    try {
      const response = await axios.get(headerUrl, { responseType: "arraybuffer" });
      const imgBuffer = Buffer.from(response.data, "binary");
      doc.image(imgBuffer, M, 20, { fit: [W - 2 * M, 80], align: 'center' });
    } catch (_) {
      console.error("Header image failed to load");
    }
  }

  // Header Text - placed cleanly below the image area
  doc.fillColor("white").font("Times-Bold").fontSize(24)
    .text("STUDENT REPORT", M, 110, { align: "left", characterSpacing: 1 });

  doc.fillColor("white").font("Times-Bold").fontSize(10)
    .text(`Date: ${new Date().toLocaleDateString('en-IN')}`, W - M - 150, 115, { align: "right", width: 150 });
  doc.fillColor("#e9d5ff").font("Times-Bold").fontSize(10)
    .text(`Student ID: ${student.studentId}`, W - M - 150, 130, { align: "right", width: 150 });

  let cursorY = headerHeight + 30;

  // Student Profile Card
  const cardW = W - 2 * M;
  doc.roundedRect(M, cursorY, cardW, 110, 8).fill("white");
  doc.roundedRect(M, cursorY, cardW, 110, 8).stroke("#e5e7eb");

  doc.save();
  doc.roundedRect(M, cursorY, cardW, 110, 8).clip();
  doc.rect(M, cursorY, 6, 110).fill("#bde045");
  doc.restore();

  doc.fillColor("#4b2d84").font("Times-Bold").fontSize(11)
    .text("STUDENT PROFILE", M + 25, cursorY + 15, { characterSpacing: 1 });

  doc.fillColor("#111827").font("Times-Bold").fontSize(22)
    .text(student.studentName, M + 25, cursorY + 35);

  // Data items with small icons
  const dataY = cursorY + 65;
  doc.fontSize(10);
  doc.fillColor("#6b7280").font("Times-Roman").text("Standard", M + 25, dataY)
    .fillColor("#111827").font("Times-Bold").text(`Grade ${student.standard}`, M + 25, dataY + 15);

  doc.fillColor("#6b7280").font("Times-Roman").text("Mobile No", M + 140, dataY)
    .fillColor("#111827").font("Times-Bold").text(`+91 ${student.mobileNo}`, M + 140, dataY + 15);

  doc.fillColor("#6b7280").font("Times-Roman").text("Class Rank", M + 260, dataY)
    .fillColor("#d97706").font("Times-Bold").text(`Rank #${stats.studentRank}`, M + 260, dataY + 15);

  doc.fillColor("#6b7280").font("Times-Roman").text("Reward Points", M + 360, dataY)
    .fillColor("#10b981").font("Times-Bold").text(`${Math.trunc(student.points || 0)} Points`, M + 360, dataY + 15);

  cursorY += 135;

  // Attendance Summary Card
  doc.fillColor("#4b2d84").font("Times-Bold").fontSize(12)
    .text("ATTENDANCE OVERVIEW", M, cursorY, { characterSpacing: 1 });
  cursorY += 25;

  doc.roundedRect(M, cursorY, cardW, 80, 8).fill("white").stroke("#e5e7eb");

  const boxW = cardW / 4;

  // Box 1: Total Days
  doc.fillColor("#6b7280").font("Times-Roman").fontSize(10).text("Total Days", M, cursorY + 20, { width: boxW, align: "center" });
  doc.fillColor("#111827").font("Times-Bold").fontSize(22).text(stats.totalDays, M, cursorY + 35, { width: boxW, align: "center" });

  doc.rect(M + boxW, cursorY + 15, 1, 50).fill("#f3f4f6");

  // Box 2: Present
  doc.fillColor("#6b7280").font("Times-Roman").fontSize(10).text("Present", M + boxW, cursorY + 20, { width: boxW, align: "center" });
  doc.fillColor("#059669").font("Times-Bold").fontSize(22).text(stats.presentDays, M + boxW, cursorY + 35, { width: boxW, align: "center" });

  doc.rect(M + boxW * 2, cursorY + 15, 1, 50).fill("#f3f4f6");

  // Box 3: Absent
  doc.fillColor("#6b7280").font("Times-Roman").fontSize(10).text("Absent", M + boxW * 2, cursorY + 20, { width: boxW, align: "center" });
  doc.fillColor("#dc2626").font("Times-Bold").fontSize(22).text(stats.absentDays, M + boxW * 2, cursorY + 35, { width: boxW, align: "center" });

  doc.rect(M + boxW * 3, cursorY + 15, 1, 50).fill("#f3f4f6");

  // Box 4: Percentage
  doc.fillColor("#6b7280").font("Times-Roman").fontSize(10).text("Percentage", M + boxW * 3, cursorY + 20, { width: boxW, align: "center" });
  doc.fillColor("#4b2d84").font("Times-Bold").fontSize(22).text(`${stats.attendancePercentage}%`, M + boxW * 3, cursorY + 35, { width: boxW, align: "center" });

  cursorY += 110;

  function checkPageAdd(heightNeeded) {
    if (cursorY + heightNeeded > doc.page.height - 60) {
      doc.addPage();
      doc.rect(0, 0, W, doc.page.height).fill("#fafafa");
      drawWatermark();

      doc.rect(0, 0, W, 40).fill(primaryGrad);
      doc.fillColor("white").font("Times-Bold").fontSize(14)
        .text("STUDENT REPORT", M, 13);
      doc.fillColor("#e9d5ff").font("Times-Roman").fontSize(10)
        .text(student.studentName, W - M - 200, 15, { align: "right", width: 200 });

      cursorY = 70;
    }
  }

  function drawTableHeader(title, columns, widths) {
    checkPageAdd(80);

    doc.fillColor("#4b2d84").font("Times-Bold").fontSize(12)
      .text(title.toUpperCase(), M, cursorY, { characterSpacing: 1 });
    cursorY += 20;

    doc.roundedRect(M, cursorY, cardW, 25, 4).fill("#ede9fe");

    doc.fillColor("#4b2d84").font("Times-Bold").fontSize(9);
    let curX = M + 15;
    columns.forEach((col, i) => {
      doc.text(col.toUpperCase(), curX, cursorY + 8, { width: widths[i], characterSpacing: 0.5 });
      curX += widths[i];
    });
    cursorY += 25;
  }

  // Fee Payments Table (Move this up to Page 1)
  const feeCols = ["For Month", "Date Paid", "Method", "Amount", "Status"];
  const feeWidths = [140, 100, 100, 100, 70];

  drawTableHeader("Fee Payment History", feeCols, feeWidths);

  const monthsList = ["May", "June", "July", "August", "September", "October", "November", "December", "January", "February", "March", "April"];
  const now = new Date();
  let startYear = now.getFullYear();
  if (now.getMonth() < 5) startYear--;

  const academicFees = monthsList.map((m, idx) => {
    const year = idx < 8 ? startYear : startYear + 1;
    const record = stats.recentFees.find(f => f.month === m && Number(f.year) === year);
    return { month: m, year, record };
  });

  academicFees.forEach((item, i) => {
    const isEven = i % 2 === 0;
    if (!isEven) doc.rect(M, cursorY, cardW, 20).fill("#f3f4f6");
    else doc.rect(M, cursorY, cardW, 20).fill("white");
    doc.rect(M, cursorY + 20, cardW, 0.5).fill("#e5e7eb");

    let curX = M + 15;
    doc.fillColor("#111827").font("Times-Bold").fontSize(8).text(`${item.month} ${item.year}`, curX, cursorY + 6, { width: feeWidths[0] });
    curX += feeWidths[0];

    if (item.record) {
      doc.fillColor("#4b5563").font("Times-Roman").fontSize(8);
      doc.text(new Date(item.record.datePaid).toLocaleDateString("en-IN"), curX, cursorY + 6, { width: feeWidths[1] });
      curX += feeWidths[1];
      doc.text(item.record.method || "-", curX, cursorY + 6, { width: feeWidths[2] });
      curX += feeWidths[2];
      doc.fillColor("#4b2d84").font("Times-Bold").text(`Rs. ${Number(item.record.amount).toLocaleString("en-IN")}`, curX, cursorY + 6, { width: feeWidths[3] });
      curX += feeWidths[3];
      doc.roundedRect(curX, cursorY + 4, 40, 12, 6).fill("#d1fae5");
      doc.fillColor("#065f46").fontSize(7).text("PAID", curX, cursorY + 7, { width: 40, align: "center" });
    } else {
      doc.fillColor("#9ca3af").font("Times-Italic").fontSize(8);
      doc.text("-", curX, cursorY + 6, { width: feeWidths[1] });
      curX += feeWidths[1];
      doc.text("-", curX, cursorY + 6, { width: feeWidths[2] });
      curX += feeWidths[2];
      doc.text("-", curX, cursorY + 6, { width: feeWidths[3] });
      curX += feeWidths[3];
      doc.roundedRect(curX, cursorY + 4, 50, 12, 6).fill("#fee2e2");
      doc.fillColor("#991b1b").fontSize(6.5).text("PENDING", curX, cursorY + 7, { width: 50, align: "center" });
    }
    cursorY += 21;
  });

  // Force Academic Performance to Page 2
  doc.addPage();
  doc.rect(0, 0, W, doc.page.height).fill("#fafafa");
  drawWatermark();
  doc.rect(0, 0, W, 40).fill(primaryGrad);
  doc.fillColor("white").font("Times-Bold").fontSize(14).text("STUDENT PERFORMANCE REPORT", M, 13);
  doc.fillColor("#e9d5ff").font("Times-Roman").fontSize(10).text(student.studentName, W - M - 200, 15, { align: "right", width: 200 });
  cursorY = 70;

  // Academic Performance Table
  const academicCols = ["Date", "Test Name", "Subject", "Score", "Percentage"];
  const academicWidths = [80, 170, 120, 60, 80];

  drawTableHeader("Detailed Academic Performance", academicCols, academicWidths);

  if (stats.recentScores && stats.recentScores.length > 0) {
    stats.recentScores.forEach((score, i) => {
      checkPageAdd(35);
      const isEven = i % 2 === 0;
      if (!isEven) doc.rect(M, cursorY, cardW, 25).fill("#f3f4f6");
      else doc.rect(M, cursorY, cardW, 25).fill("white");
      doc.rect(M, cursorY + 25, cardW, 1).fill("#e5e7eb");

      let curX = M + 15;
      doc.fillColor("#4b5563").font("Times-Roman").fontSize(9).text(new Date(score.createdAt).toLocaleDateString("en-IN"), curX, cursorY + 8, { width: academicWidths[0] });
      curX += academicWidths[0];
      doc.fillColor("#111827").font("Times-Bold").text(score.testName, curX, cursorY + 8, { width: academicWidths[1] });
      curX += academicWidths[1];
      doc.fillColor("#4b5563").font("Times-Roman").text(score.testId?.subject || score.subject || "-", curX, cursorY + 8, { width: academicWidths[2] });
      curX += academicWidths[2];
      doc.fillColor("#4b5563").font("Times-Bold").text(score.score, curX, cursorY + 8, { width: academicWidths[3] });
      curX += academicWidths[3];
      let pColor = score.percentage >= 75 ? "#059669" : (score.percentage < 40 ? "#dc2626" : "#d97706");
      doc.fillColor(pColor).font("Times-Bold").text(`${score.percentage}%`, curX, cursorY + 8, { width: academicWidths[4] });
      cursorY += 26;
    });
  } else {
    doc.roundedRect(M, cursorY, cardW, 40, 4).fill("white").stroke("#e5e7eb");
    doc.fillColor("#6b7280").font("Times-Italic").fontSize(10).text("No test results recorded yet.", M, cursorY + 15, { align: "center", width: cardW });
    cursorY += 50;
  }

  // Global Footer for all pages
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const footerY = doc.page.height - 40;
    doc.rect(M, footerY, cardW, 1).fill("#e5e7eb");

    doc.fillColor("#9ca3af").font("Times-Bold").fontSize(8)
      .text("TUITION HUB EDUCATION CENTRE", M, footerY + 10, { align: "left", characterSpacing: 1 });

    doc.fillColor("#9ca3af").font("Times-Roman").fontSize(8)
      .text(`Page ${i + 1} of ${range.count}`, M, footerY + 10, { align: "right", width: cardW });
  }
}

async function generateStudentReportPDF(student, stats, res, options = {}) {
  const { disposition = "inline", setHeaders = false } = options;
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 40, left: 40, right: 40, bottom: 0 },
    bufferPages: true
  });

  if (setHeaders && res.setHeader) {
    const safeName = `${student.standard}-${student.studentName}-${student.studentId}`.replace(/[^a-zA-Z0-9- ]/g, "").replace(/\s+/g, "-");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `${disposition}; filename=${safeName}.pdf`
    );
  }

  doc.pipe(res);
  await drawStudentReport(doc, student, stats);
  doc.end();
}

app.get(
  "/teacher/bulk_student_reports",
  ensureDBConnection,
  requireTeacherLogin,
  async (req, res) => {
    try {
      const students = await User.find({ role: { $ne: "teacher" } }).lean();

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", "attachment; filename=all-student-reports.zip");

      const archive = archiver("zip", { zlib: { level: 9 } });
      archive.pipe(res);

      const allStudentsData = await User.find({}).sort({ points: -1 }).lean();

      for (const student of students) {
        const studentId = student.studentId;

        const recentFees = await Fee.find({ studentId: studentId, status: "Paid" })
          .sort({ datePaid: 1 })
          .lean();

        const recentScores = await Score.find({ studentId: studentId })
          .populate("testId", "subject")
          .sort({ createdAt: 1 })
          .lean();

        const allAttendanceRecords = await Attendance.find({
          "records.studentId": studentId,
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

        const attendancePercentage =
          totalDays > 0 ? ((presentDays / (presentDays + absentDays)) * 100).toFixed(1) : 0;

        let studentRank = "-";
        const rankIndex = allStudentsData.findIndex(s => s._id.toString() === student._id.toString());
        if (rankIndex !== -1) {
          studentRank = rankIndex + 1;
        }

        const doc = new PDFDocument({
          size: "A4",
          margins: { top: 40, left: 40, right: 40, bottom: 0 },
          bufferPages: true
        });

        const safeName = `${student.standard}-${student.studentName}-${student.studentId}`.replace(/[^a-zA-Z0-9- ]/g, "").replace(/\s+/g, "-");

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
  }
);

app.get(
  "/teacher/student_report/:id",
  ensureDBConnection,
  requireTeacherLogin,
  async (req, res) => {
    try {
      const student = await User.findById(req.params.id).lean();
      if (!student) return res.status(404).send("Student not found");

      const studentId = student.studentId;

      const recentFees = await Fee.find({ studentId: studentId, status: "Paid" })
        .sort({ datePaid: 1 })
        .lean();

      const recentScores = await Score.find({ studentId: studentId })
        .populate("testId", "subject")
        .sort({ createdAt: 1 })
        .lean();

      const allAttendanceRecords = await Attendance.find({
        "records.studentId": studentId,
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

      const attendancePercentage =
        totalDays > 0 ? ((presentDays / (presentDays + absentDays)) * 100).toFixed(1) : 0;

      const allStudents = await User.find({})
        .sort({ points: -1 })
        .lean();

      let studentRank = "-";
      const rankIndex = allStudents.findIndex(s => s._id.toString() === student._id.toString());
      if (rankIndex !== -1) {
        studentRank = rankIndex + 1;
      }

      const stats = {
        recentFees,
        recentScores,
        attendancePercentage,
        presentDays,
        absentDays,
        totalDays,
        studentRank
      };

      await generateStudentReportPDF(student, stats, res, { disposition: "inline", setHeaders: true });
    } catch (err) {
      console.error("Error generating student report:", err);
      res.status(500).send("Error generating student report");
    }
  }
);

app.get(
  "/teacher/edit_profile/:id",
  ensureDBConnection,
  requireTeacherLogin,
  async (req, res) => {
    const student = await User.findById(req.params.id).lean();
    if (!student) return res.status(404).send("Student not found");
    res.render("teacher/edit_profile", { student });
  }
);

app.post(
  "/teacher/edit_profile/:id",
  ensureDBConnection,
  requireTeacherLogin,
  upload.single("profilePhoto"),
  async (req, res) => {
    try {
      const { studentName, standard, mobileNo } = req.body;
      const updateData = { studentName, standard, mobileNo };

      if (req.file) {
        const result = await uploadToCloudinary(
          req.file.buffer,
          "student-profiles"
        );
        updateData.profilePhoto = result.secure_url;
      }

      await User.findByIdAndUpdate(req.params.id, updateData);
      res.redirect(`/teacher/view_profile/${req.params.id}`);
    } catch (err) {
      console.error(err);
      res.status(500).send("Error updating profile");
    }
  }
);

app.get(
  "/teacher/manage_attendance",
  ensureDBConnection,
  requireTeacherLogin,
  async (req, res) => {
    const students = await User.find().lean();
    const attendanceRecords = await Attendance.find().lean();

    const attendanceMap = {};
    attendanceRecords.forEach((record) => {
      attendanceMap[record.date] = {};
      (record.records || []).forEach(
        (r) => (attendanceMap[record.date][r.studentId] = r.status)
      );
    });

    res.render("teacher/manage_attendance", {
      students,
      attendance: attendanceMap,
    });
  }
);

app.post(
  "/teacher/manage_attendance",
  ensureDBConnection,
  requireTeacherLogin,
  async (req, res) => {
    try {
      const { date, records } = req.body;
      let attendance = await Attendance.findOne({ date });
      if (attendance) attendance.records = records;
      else attendance = new Attendance({ date, records });
      await attendance.save();
      res.json({ success: true, message: "Attendance saved successfully!" });
    } catch (err) {
      console.error("Error saving attendance:", err);
      res.status(500).json({ success: false, message: "Failed to save attendance." });
    }
  }
);

app.get(
  "/teacher/defaulters/:year/:month",
  ensureDBConnection,
  requireTeacherLogin,
  async (req, res) => {
    try {
      const { year, month } = req.params;
      const startDate = new Date(`${year}-${month}-01`);
      const endDate = new Date(year, parseInt(month), 0);

      const students = await User.find().lean();

      const attendanceDocs = await Attendance.find({
        date: {
          $gte: startDate.toISOString().split("T")[0],
          $lte: endDate.toISOString().split("T")[0],
        },
      }).lean();

      const stats = {};
      students.forEach((s) => {
        stats[s.studentId] = {
          studentId: s.studentId,
          studentName: s.studentName,
          standard: s.standard,
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
  }
);

app.get(
  "/teacher/detailed_attendance",
  ensureDBConnection,
  requireTeacherLogin,
  async (req, res) => {
    try {
      const students = await User.find().lean();
      const attendanceRecords = await Attendance.find().lean();

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
        const dateKey = record.date;
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
      res.status(500).send("❌ Failed to generate attendance report.");
    }
  }
);

app.get("/teacher/bulk_attendance", ensureDBConnection, requireTeacherLogin, async (req, res) => {
  try {
    const date = new Date();
    const selectedYear = parseInt(req.query.year) || date.getFullYear();
    const selectedMonth = parseInt(req.query.month) || (date.getMonth() + 1);

    const students = await User.find({}, "studentId studentName").sort({ studentId: 1 });

    const totalDays = new Date(selectedYear, selectedMonth, 0).getDate();
    const daysArray = [];
    const monthStr = String(selectedMonth).padStart(2, '0');

    for (let d = 1; d <= totalDays; d++) {
      const dayStr = String(d).padStart(2, '0');
      daysArray.push(`${selectedYear}-${monthStr}-${dayStr}`);
    }

    const regex = new RegExp(`^${selectedYear}-${monthStr}-`);
    const attendanceRecords = await Attendance.find({ date: regex });

    const attendanceMap = {};
    attendanceRecords.forEach(doc => {
      attendanceMap[doc.date] = {};
      doc.records.forEach(r => {
        attendanceMap[doc.date][r.studentId] = r.status;
      });
    });

    const currentYear = new Date().getFullYear();
    const years = [currentYear - 1, currentYear, currentYear + 1];

    res.render("teacher/bulk_attendance", {
      students,
      daysArray,
      attendanceMap,
      selectedYear,
      selectedMonth,
      years
    });

  } catch (err) {
    console.error("Error loading attendance:", err);
    res.status(500).send("Server Error");
  }
});

app.post("/teacher/bulk_save_attendance", ensureDBConnection, requireTeacherLogin, async (req, res) => {
  try {
    const { attendanceData } = req.body;

    const operations = [];

    for (const [dateStr, records] of Object.entries(attendanceData)) {
      if (records.length > 0) {
        operations.push({
          updateOne: {
            filter: { date: dateStr },
            update: {
              $set: {
                date: dateStr,
                records: records
              }
            },
            upsert: true
          }
        });
      }
    }

    if (operations.length > 0) {
      await Attendance.bulkWrite(operations);
    }

    res.json({ success: true, message: "Attendance saved successfully!" });

  } catch (err) {
    console.error("Save Error:", err);
    res.json({ success: false, message: "Failed to save data." });
  }
});

app.get(
  "/teacher/add_test",
  ensureDBConnection,
  requireTeacherLogin,
  (req, res) => res.render("teacher/add_test")
);

app.post(
  "/teacher/add_test",
  ensureDBConnection,
  requireTeacherLogin,
  upload.single("questionPaperFile"),
  async (req, res) => {
    try {
      const {
        testName,
        standard,
        subject,
        topic,
        totalMarks,
        testDate,
        questionPaperLink,
      } = req.body;

      let questionPaperUrl = null;

      if (req.file) {
        const result = await uploadToCloudinary(req.file.buffer, "tests");
        questionPaperUrl = result.secure_url;
      }
      else if (questionPaperLink) {
        questionPaperUrl = questionPaperLink;
      }

      if (!questionPaperUrl) {
        return res.status(400).send("❌ Please upload a question paper file or provide a link.");
      }

      const newTest = new Test({
        testName,
        standard,
        subject,
        topic,
        totalMarks,
        testDate: testDate ? new Date(testDate) : null,
        questionPaper: questionPaperUrl,
      });

      await newTest.save();
      res.json({ success: true, message: "✅ Test created successfully!" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: "❌ Failed to add test" });
    }
  }
);

app.get(
  "/teacher/manage_tests",
  ensureDBConnection,
  requireTeacherLogin,
  async (req, res) => {
    const tests = await Test.find().lean();
    res.render("teacher/manage_tests", { tests });
  }
);
app.post(
  "/teacher/delete_test/:id",
  ensureDBConnection,
  requireTeacherLogin,
  async (req, res) => {
    await Test.findByIdAndDelete(req.params.id);
    res.redirect("/teacher/manage_tests");
  }
);

app.post(
  "/teacher/edit_test/:id",
  ensureDBConnection,
  requireTeacherLogin,
  upload.single("questionPaperFile"),
  async (req, res) => {
    try {
      const { testName, subject, topic, totalMarks, testDate, questionPaperLink } = req.body;
      const updateData = {
        testName,
        subject,
        topic,
        totalMarks: Number(totalMarks),
        testDate: testDate ? new Date(testDate) : null,
      };

      if (req.file) {
        const result = await uploadToCloudinary(req.file.buffer, "tests");
        updateData.questionPaper = result.secure_url;
      } else if (questionPaperLink && questionPaperLink.trim() !== '') {
        updateData.questionPaper = questionPaperLink.trim();
      }

      await Test.findByIdAndUpdate(req.params.id, updateData);
      res.redirect("/teacher/manage_tests");
    } catch (err) {
      console.error("Error updating test:", err);
      res.redirect("/teacher/manage_tests?error=edit_failed");
    }
  }
);

app.get(
  "/teacher/add_fees",
  ensureDBConnection,
  requireTeacherLogin,
  async (req, res) => {
    const users = await User.find({}, "studentId studentName standard").sort({
      studentId: 1,
    });
    res.render("teacher/add_fees", { users });
  }
);

app.post(
  "/teacher/add_fees",
  ensureDBConnection,
  requireTeacherLogin,
  async (req, res) => {
    try {
      const {
        studentId,
        studentName,
        standard,
        month,
        year,
        amount,
        method,
        datePaid,
      } = req.body;

      const newFee = new Fee({
        studentId,
        studentName,
        standard,
        month,
        year,
        amount,
        method,
        datePaid,
      });

      await newFee.save();
      res.json({ success: true, message: "Fee added successfully!" });
    } catch (err) {
      console.error(err);
      res.json({ success: false, message: "Error saving fee!" });
    }
  }
);

app.get(
  "/teacher/manage_fees",
  ensureDBConnection,
  requireTeacherLogin,
  async (req, res) => {
    try {
      const studentsRaw = await User.find({}, "studentId studentName standard").lean();
      const students = studentsRaw.sort((a, b) => {
        const stdDiff = Number(a.standard) - Number(b.standard);
        if (stdDiff !== 0) return stdDiff;
        return String(a.studentId).localeCompare(String(b.studentId), undefined, { numeric: true });
      });
      const fees = await Fee.find().lean();

      const months = [
        "May", "June", "July", "August", "September", "October",
        "November", "December", "January", "February", "March", "April",
      ];

      const studentsWithFees = students.map((student) => {
        const studentFees = fees.filter((f) => f.studentId === student.studentId);

        const feeMap = {};
        months.forEach((month) => {
          const feeRecord = studentFees.find((f) => f.month === month);

          if (feeRecord && feeRecord.datePaid) {
            const d = new Date(feeRecord.datePaid);
            const day = String(d.getDate()).padStart(2, '0');
            const monthNum = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();

            feeMap[month] = `${day}-${monthNum}-${year}`;
          } else {
            feeMap[month] = null;
          }
        });

        return {
          studentName: student.studentName,
          studentId: student.studentId,
          standard: student.standard,
          fees: feeMap,
        };
      });

      res.render("teacher/manage_fees", { studentsWithFees, months });
    } catch (err) {
      console.error(err);
      res.send("Error loading fees");
    }
  }
);

app.get(
  "/teacher/detailed_fees",
  ensureDBConnection,
  requireTeacherLogin,
  async (req, res) => {
    try {
      const students = await User.find(
        {},
        "studentId studentName standard monthlyFee"
      ).lean();
      const allFees = await Fee.find().lean();

      const months = [
        "May", "June", "July", "August", "September", "October",
        "November", "December", "January", "February", "March", "April",
      ];

      const report = students.map((student) => {
        const studentFees = allFees.filter(
          (f) => f.studentId === student.studentId
        );

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
          standard: student.standard,
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
  }
);

app.get(
  "/teacher/fee_defaulters",
  ensureDBConnection,
  requireTeacherLogin,
  async (req, res) => {
    try {
      const today = new Date();
      const currentCalYear = today.getFullYear();
      const currentMonthNum = today.getMonth() + 1; // 1-12

      const currentYear = currentCalYear;
      const selectedYear = parseInt(req.query.year) || currentYear;

      const allMonths = [
        "May", "June", "July", "August", "September", "October",
        "November", "December", "January", "February", "March", "April",
      ];

      const monthNum = {
        May: 5, June: 6, July: 7, August: 8, September: 9, October: 10,
        November: 11, December: 12, January: 1, February: 2, March: 3, April: 4,
      };

      const effectiveMonths = allMonths.filter((m) => {
        const calYear = monthNum[m] >= 5 ? selectedYear : selectedYear + 1;
        if (calYear < currentCalYear) return true;
        if (calYear === currentCalYear && monthNum[m] <= currentMonthNum) return true;
        return false;
      });

      const studentsRaw = await User.find(
        {},
        "studentId studentName standard mobileNo monthlyFee"
      ).lean();

      const students = studentsRaw.sort((a, b) => {
        const stdDiff = Number(a.standard) - Number(b.standard);
        if (stdDiff !== 0) return stdDiff;
        return String(a.studentId).localeCompare(String(b.studentId), undefined, { numeric: true });
      });

      const allFees = await Fee.find({
        $or: [
          { year: selectedYear, month: { $in: ["May", "June", "July", "August", "September", "October", "November", "December"] } },
          { year: selectedYear + 1, month: { $in: ["January", "February", "March", "April"] } },
        ],
        status: "Paid",
      }).lean();

      const feeMap = {};
      allFees.forEach((f) => { feeMap[`${f.studentId}-${f.month}`] = f; });

      const defaulters = [];
      students.forEach((s) => {
        const monthlyFee = s.monthlyFee || 0;
        const unpaidMonths = [];
        let totalPaid = 0;

        effectiveMonths.forEach((month) => {
          const key = `${s.studentId}-${month}`;
          if (feeMap[key]) { totalPaid += feeMap[key].amount; }
          else { unpaidMonths.push(month); }
        });

        const totalDue = monthlyFee * effectiveMonths.length;
        const balance = totalDue - totalPaid;

        if (unpaidMonths.length > 0) {
          defaulters.push({
            studentId: s.studentId, studentName: s.studentName,
            standard: s.standard, mobileNo: s.mobileNo,
            monthlyFee, totalPaid, totalDue, balance,
            unpaidMonths, unpaidCount: unpaidMonths.length,
          });
        }
      });

      defaulters.sort((a, b) => b.balance - a.balance);

      const monthData = {};
      effectiveMonths.forEach((month) => {
        const unpaid = [];
        students.forEach((s) => {
          if (!feeMap[`${s.studentId}-${month}`]) {
            unpaid.push({
              standard: s.standard,
              studentId: s.studentId,
              studentName: s.studentName,
              balance: s.monthlyFee || 0,
            });
          }
        });
        if (unpaid.length > 0) monthData[month] = unpaid;
      });

      const years = [currentYear - 1, currentYear, currentYear + 1];
      const headerUrl = process.env.CLOUDINARY_HEADER_URL || "";
      res.render("teacher/fee_defaulters", {
        defaulters, effectiveMonths, monthData, selectedYear, years, headerUrl
      });
    } catch (err) {
      console.error("Error loading fee defaulters:", err);
      res.status(500).send("Error generating fee defaulters report");
    }
  }
);


app.get(
  "/teacher/revenue_report",
  ensureDBConnection,
  requireTeacherLogin,
  async (req, res) => {
    const selectedYear = parseInt(req.query.year) || new Date().getFullYear();

    const months = [
      "May", "June", "July", "August", "September", "October",
      "November", "December", "January", "February", "March", "April"
    ];

    const fees = await Fee.find({
      status: "Paid",
      $or: [
        { year: selectedYear, month: { $in: ["May", "June", "July", "August", "September", "October", "November", "December"] } },
        { year: selectedYear + 1, month: { $in: ["January", "February", "March", "April"] } }
      ]
    });

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

      if (!standardStats[fee.standard]) {
        standardStats[fee.standard] = { total: 0, count: 0 };
      }
      standardStats[fee.standard].total += fee.amount;
      standardStats[fee.standard].count++;

      if (methodStats[fee.method] !== undefined) {
        methodStats[fee.method]++;
      }

      totalRevenue += fee.amount;
    });

    const paymentCount = fees.length;
    const averageRevenue = paymentCount > 0 ? (totalRevenue / paymentCount).toFixed(2) : 0;

    const recentPayments = await Fee.find({ status: "Paid" })
      .sort({ datePaid: -1 })
      .limit(10);

    const allYears = await Fee.distinct("year");
    const years = allYears.sort((a, b) => b - a);

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
      selectedYear,
    });
  }
);

app.get("/teacher/bulk_fees", ensureDBConnection, requireTeacherLogin, async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const selectedYear = parseInt(req.query.year) || currentYear;

    const years = [];
    for (let y = currentYear - 1; y <= currentYear + 5; y++) {
      years.push(y);
    }

    const users = await User.find({}, "studentId studentName standard monthlyFee").sort({ studentId: 1 });

    const fees = await Fee.find({
      $or: [
        { year: selectedYear, month: { $in: ["May", "June", "July", "August", "September", "October", "November", "December"] } },
        { year: selectedYear + 1, month: { $in: ["January", "February", "March", "April"] } }
      ]
    });

    const feeMap = {};
    fees.forEach(fee => {
      if (!feeMap[fee.studentId]) feeMap[fee.studentId] = {};
      feeMap[fee.studentId][fee.month] = fee;
    });

    const months = ["May", "June", "July", "August", "September", "October", "November", "December", "January", "February", "March", "April"];

    res.render("teacher/bulk_fees", {
      users,
      feeMap,
      months,
      selectedYear,
      years
    });

  } catch (err) {
    console.error("Error loading bulk fees:", err);
    res.status(500).send("Server Error");
  }
});

app.post("/teacher/bulk_save", ensureDBConnection, requireTeacherLogin, async (req, res) => {
  try {
    const updates = req.body.updates;

    if (!updates || updates.length === 0) {
      return res.json({ success: true, message: "No changes to save." });
    }

    const operations = updates.map(update => {
      const filter = {
        studentId: update.studentId,
        month: update.month,
        year: update.year
      };

      const updateData = {
        studentId: update.studentId,
        studentName: update.studentName,
        standard: update.standard,
        month: update.month,
        year: update.year,
        amount: Number(update.amount),
        method: update.method,
        datePaid: new Date(update.datePaid),
        status: "Paid"
      };

      return {
        updateOne: {
          filter: filter,
          update: { $set: updateData },
          upsert: true
        }
      };
    });

    await Fee.bulkWrite(operations);

    res.json({ success: true, message: "Fees updated successfully!" });

  } catch (err) {
    console.error("Bulk Save Error:", err);
    res.json({ success: false, message: "Error saving fees." });
  }
});

app.get(
  "/teacher/manage_score",
  ensureDBConnection,
  requireTeacherLogin,
  async (req, res) => {
    const users = await User.find({});
    const standards = [...new Set(users.map((u) => u.standard))].sort((a, b) => Number(a) - Number(b));
    res.render("teacher/manage_score", { standards });
  }
);

app.get(
  "/api/tests/:standard",
  ensureDBConnection,
  requireTeacherLogin,
  async (req, res) => {
    const tests = await Test.find({ standard: req.params.standard });
    res.json(tests);
  }
);

app.get(
  "/api/scores/:standard/:testId",
  ensureDBConnection,
  requireTeacherLogin,
  async (req, res) => {
    try {
      const { standard, testId } = req.params;

      const [students, allScores] = await Promise.all([
        User.find({ standard }).lean(),
        Score.find({ testId, standard }).lean(),
      ]);

      const scoreMap = {};
      allScores.forEach((sc) => (scoreMap[sc.studentId] = sc));

      const studentScores = students.map((s) => ({
        _id: s._id,
        studentId: s.studentId,
        studentName: s.studentName,
        score: scoreMap[s.studentId]?.score ?? "",
        percentage: scoreMap[s.studentId]?.percentage ?? "-",
      }));

      res.json(studentScores);
    } catch (err) {
      console.error("Error fetching scores:", err);
      res.status(500).json({ error: "Failed to load scores" });
    }
  }
);

app.post(
  "/api/scores/save",
  ensureDBConnection,
  requireTeacherLogin,
  async (req, res) => {
    const { testId, scores } = req.body;
    const test = await Test.findById(testId);

    for (let s of scores) {
      if (s.score === undefined || s.score === null) continue;

      const student = await User.findOne({ studentId: s.studentId });
      const newPercent = parseFloat(((s.score / test.totalMarks) * 100).toFixed(2));

      const existingScore = await Score.findOne({ studentId: s.studentId, testId });
      const oldPoints = existingScore ? parseFloat(existingScore.percentage) : 0;

      await Score.findOneAndUpdate(
        { studentId: s.studentId, testId },
        {
          studentId: s.studentId,
          studentName: student.studentName,
          standard: student.standard,
          testId,
          testName: test.testName,
          score: s.score,
          percentage: newPercent,
        },
        { upsert: true, new: true }
      );

      const pointDelta = newPercent - oldPoints;
      if (pointDelta !== 0) {
        await User.findOneAndUpdate(
          { studentId: s.studentId },
          { $inc: { points: pointDelta } }
        );
      }
    }

    res.json({ message: "Scores saved successfully!" });
  }
);

app.get(
  "/api/scores/consolidated_classwise",
  ensureDBConnection,
  requireTeacherLogin,
  async (req, res) => {
    const classes = ["5", "6", "7", "8", "9", "10"];
    const result = {};

    for (let cls of classes) {
      const students = await User.find({ standard: cls }).sort({
        studentId: 1,
      });
      const tests = await Test.find({ standard: cls }).sort({ createdAt: 1 });
      const scores = await Score.find({ standard: cls });

      const studentRows = students.map((s) => ({
        studentId: s.studentId,
        studentName: s.studentName,
        scores: {},
      }));

      scores.forEach((sc) => {
        const row = studentRows.find((r) => r.studentId === sc.studentId);
        if (row) row.scores[sc.testId.toString()] = sc.percentage;
      });

      result[cls] = {
        tests: tests.map((t) => ({
          _id: t._id,
          testName: t.testName,
          subject: t.subject,
          topic: t.topic,
        })),
        students: studentRows,
      };
    }

    res.json(result);
  }
);

app.get(
  "/teacher/study_material",
  ensureDBConnection,
  requireTeacherLogin,
  async (req, res) => {
    const materials = await StudyMaterial.find()
      .sort({ uploadedAt: -1 })
      .lean();
    res.render("teacher/study_material", { materials });
  }
);
app.post(
  "/teacher/study_material",
  ensureDBConnection,
  requireTeacherLogin,
  upload.single("file"),
  async (req, res) => {
    try {
      const { standard, subject, materialType, description, link } = req.body;

      let filePath = null;

      if (req.file) {
        const result = await uploadToCloudinary(
          req.file.buffer,
          "study-materials"
        );
        filePath = result.secure_url;
      } else if (link) {
        filePath = link;
      }

      if (!filePath) {
        return res.json({
          success: false,
          message: "Please upload a file or provide a link.",
        });
      }

      const newMaterial = new StudyMaterial({
        standard,
        subject,
        materialType,
        description,
        filePath,
      });

      await newMaterial.save();

      res.json({
        success: true,
        message: "📚 Material uploaded successfully!",
      });
    } catch (err) {
      console.error(err);
      res.json({ success: false, message: "❌ Failed to upload material" });
    }
  }
);

app.put(
  "/api/materials/:id",
  ensureDBConnection,
  requireTeacherLogin,
  upload.single("file"),
  async (req, res) => {
    try {
      const material = await StudyMaterial.findById(req.params.id);
      if (!material) {
        return res.status(404).json({ success: false, message: "Material not found" });
      }

      const { standard, subject, materialType, description, link } = req.body;

      material.standard = standard || material.standard;
      material.subject = subject || material.subject;
      material.materialType = materialType || material.materialType;
      material.description = description || "";

      if (req.file) {
        const result = await uploadToCloudinary(req.file.buffer, "study-materials");
        material.filePath = result.secure_url;
      } else if (link && link.trim() !== "") {
        material.filePath = link;
      }

      await material.save();

      res.json({ success: true, message: "✏️ Material updated successfully!" });
    } catch (err) {
      console.error("Error updating material:", err);
      res.status(500).json({ success: false, message: "❌ Failed to update material" });
    }
  }
);

app.delete(
  "/api/materials/:id",
  ensureDBConnection,
  requireTeacherLogin,
  async (req, res) => {
    try {
      const material = await StudyMaterial.findByIdAndDelete(req.params.id);

      if (!material) {
        return res.status(404).json({ error: "Material not found" });
      }

      res.json({ success: true, message: "Material deleted successfully" });
    } catch (err) {
      console.error("Error deleting material:", err);
      res.status(500).json({ error: "Failed to delete material" });
    }
  }
);

app.get(
  "/student/timetable",
  ensureDBConnection,
  requireStudentLogin,
  async (req, res) => {
    try {
      const student = req.user;
      const entries = await ExamTimetable.find({ standard: student.standard })
        .sort({ examDate: 1 })
        .lean();
      res.render("student/timetable", { student, entries, success: req.query.success, error: req.query.error });
    } catch (err) {
      console.error("Timetable load error:", err);
      res.status(500).send("Error loading timetable");
    }
  }
);

app.post(
  "/student/timetable",
  ensureDBConnection,
  requireStudentLogin,
  async (req, res) => {
    try {
      const student = req.user;
      const { examType, subject, examDate, chapters } = req.body;
      if (!examType || !subject || !examDate || !chapters) {
        return res.redirect("/student/timetable?error=All+fields+are+required");
      }
      await ExamTimetable.create({
        standard: student.standard,
        examType,
        subject: subject.trim(),
        examDate: new Date(examDate),
        chapters: chapters.trim(),
        addedBy: "student",
        addedById: student.studentId,
        addedByName: student.studentName,
      });
      res.redirect("/student/timetable?success=Exam+added+successfully");
    } catch (err) {
      console.error("Timetable add error:", err);
      res.redirect("/student/timetable?error=Failed+to+add+exam");
    }
  }
);

app.post(
  "/student/timetable/edit/:id",
  ensureDBConnection,
  requireStudentLogin,
  async (req, res) => {
    try {
      const { examType, subject, examDate, chapters } = req.body;
      await ExamTimetable.findByIdAndUpdate(req.params.id, {
        examType,
        subject: subject.trim(),
        examDate: new Date(examDate),
        chapters: chapters.trim(),
      });
      res.redirect("/student/timetable?success=Entry+updated");
    } catch (err) {
      console.error("Timetable edit error:", err);
      res.redirect("/student/timetable?error=Failed+to+update");
    }
  }
);

app.post(
  "/student/timetable/delete/:id",
  ensureDBConnection,
  requireStudentLogin,
  async (req, res) => {
    try {
      await ExamTimetable.findByIdAndDelete(req.params.id);
      res.redirect("/student/timetable?success=Entry+deleted");
    } catch (err) {
      console.error("Timetable delete error:", err);
      res.redirect("/student/timetable?error=Failed+to+delete");
    }
  }
);

app.post(
  "/student/timetable/bulk",
  ensureDBConnection,
  requireStudentLogin,
  async (req, res) => {
    try {
      const student = req.user;

      const examType = req.body.examType;
      let subjects = req.body.subjects || req.body["subjects[]"] || [];
      let dates = req.body.dates || req.body["dates[]"] || [];
      let chapters = req.body.chapters || req.body["chapters[]"] || [];

      subjects = Array.isArray(subjects) ? subjects : [subjects];
      dates = Array.isArray(dates) ? dates : [dates];
      chapters = Array.isArray(chapters) ? chapters : [chapters];

      subjects = subjects.filter(Boolean);

      if (!examType || subjects.length === 0) {
        return res.redirect("/student/timetable?error=Please+fill+all+fields");
      }

      const docs = subjects.map((subj, i) => ({
        standard: student.standard,
        examType,
        subject: subj.trim(),
        examDate: new Date(dates[i] || Date.now()),
        chapters: (chapters[i] || "").trim(),
        addedBy: "student",
        addedById: student.studentId,
        addedByName: student.studentName,
      })).filter(d => d.subject);

      await ExamTimetable.insertMany(docs);
      res.redirect(`/student/timetable?success=${docs.length}+exam(s)+added+successfully`);
    } catch (err) {
      console.error("Bulk timetable add error:", err);
      res.redirect("/student/timetable?error=Failed+to+add+exams");
    }
  }
);

app.post(
  "/student/timetable/edit/:id",
  ensureDBConnection,
  requireStudentLogin,
  async (req, res) => {
    try {
      const student = req.user;
      const { examType, subject, examDate, chapters } = req.body;
      await ExamTimetable.findOneAndUpdate(
        { _id: req.params.id, addedById: student.studentId },
        {
          examType,
          subject: subject.trim(),
          examDate: new Date(examDate),
          chapters: chapters.trim(),
        }
      );
      res.redirect("/student/timetable?success=Entry+updated");
    } catch (err) {
      console.error("Student timetable edit error:", err);
      res.redirect("/student/timetable?error=Failed+to+update");
    }
  }
);

app.post(
  "/student/timetable/delete/:id",
  ensureDBConnection,
  requireStudentLogin,
  async (req, res) => {
    try {
      const student = req.user;
      await ExamTimetable.findOneAndDelete({ _id: req.params.id, addedById: student.studentId });
      res.redirect("/student/timetable?success=Entry+deleted");
    } catch (err) {
      console.error("Student timetable delete error:", err);
      res.redirect("/student/timetable?error=Failed+to+delete");
    }
  }
);

app.get(
  "/teacher/timetable",
  ensureDBConnection,
  requireTeacherLogin,
  async (req, res) => {
    try {
      const standard = req.query.standard || "";
      const query = standard ? { standard } : {};
      const entries = await ExamTimetable.find(query).sort({ examDate: 1 }).lean();

      const groupedEntriesByStandard = {};
      entries.forEach(entry => {
        const std = entry.standard;
        if (!groupedEntriesByStandard[std]) {
          groupedEntriesByStandard[std] = [];
        }

        const dateStr = new Date(entry.examDate).toISOString();
        const key = `${entry.examType}_${entry.subject}_${dateStr}_${entry.chapters}`;

        let group = groupedEntriesByStandard[std].find(g => g.key === key);
        if (!group) {
          group = {
            key,
            ids: [],
            examType: entry.examType,
            subject: entry.subject,
            examDate: entry.examDate,
            chapters: entry.chapters,
            studentNames: [],
            isTeacherAdded: false,
            standard: std
          };
          groupedEntriesByStandard[std].push(group);
        }

        group.ids.push(entry._id.toString());
        if (entry.addedBy === 'teacher') {
          group.isTeacherAdded = true;
        } else {
          if (!group.studentNames.includes(entry.addedByName)) {
            group.studentNames.push(entry.addedByName);
          }
        }
      });

      const allStandards = await ExamTimetable.distinct("standard");
      const teacher = await Teacher.findById(req.session.userId).lean();
      res.render("teacher/timetable", { teacher, groupedEntriesByStandard, selectedStandard: standard, allStandards, success: req.query.success, error: req.query.error });
    } catch (err) {
      console.error("Teacher timetable load error:", err);
      res.status(500).send("Error loading timetable");
    }
  }
);

app.post(
  "/teacher/timetable",
  ensureDBConnection,
  requireTeacherLogin,
  async (req, res) => {
    try {
      const teacher = await Teacher.findById(req.session.userId).lean();
      const { standard, examType, subject, examDate, chapters } = req.body;
      if (!standard || !examType || !subject || !examDate || !chapters) {
        return res.redirect("/teacher/timetable?error=All+fields+are+required");
      }
      await ExamTimetable.create({
        standard,
        examType,
        subject: subject.trim(),
        examDate: new Date(examDate),
        chapters: chapters.trim(),
        addedBy: "teacher",
        addedById: teacher.teacherId,
        addedByName: teacher.teacherName,
      });
      res.redirect("/teacher/timetable?success=Exam+added+successfully");
    } catch (err) {
      console.error("Teacher timetable add error:", err);
      res.redirect("/teacher/timetable?error=Failed+to+add+exam");
    }
  }
);

app.post(
  "/teacher/timetable/edit/:ids",
  ensureDBConnection,
  requireTeacherLogin,
  async (req, res) => {
    try {
      const ids = req.params.ids.split(',');
      const { standard, examType, subject, examDate, chapters } = req.body;
      await ExamTimetable.updateMany(
        { _id: { $in: ids } },
        {
          standard,
          examType,
          subject: subject.trim(),
          examDate: new Date(examDate),
          chapters: chapters.trim(),
        }
      );
      res.redirect("/teacher/timetable?success=Entry+updated");
    } catch (err) {
      console.error("Teacher timetable edit error:", err);
      res.redirect("/teacher/timetable?error=Failed+to+update");
    }
  }
);

app.post(
  "/teacher/timetable/delete/:ids",
  ensureDBConnection,
  requireTeacherLogin,
  async (req, res) => {
    try {
      const ids = req.params.ids.split(',');
      await ExamTimetable.deleteMany({ _id: { $in: ids } });
      res.redirect("/teacher/timetable?success=Entry+deleted");
    } catch (err) {
      console.error("Teacher timetable delete error:", err);
      res.redirect("/teacher/timetable?error=Failed+to+delete");
    }
  }
);

app.post(
  "/teacher/timetable/bulk",
  ensureDBConnection,
  requireTeacherLogin,
  async (req, res) => {
    try {
      console.log("---- TEACHER BULK ADD BODY ----", JSON.stringify(req.body, null, 2));
      const teacher = await Teacher.findById(req.session.userId).lean();

      const standard = req.body.standard;
      const examType = req.body.examType;
      let subjects = req.body.subjects || req.body["subjects[]"] || [];
      let dates = req.body.dates || req.body["dates[]"] || [];
      let chapters = req.body.chapters || req.body["chapters[]"] || [];

      subjects = Array.isArray(subjects) ? subjects : [subjects];
      dates = Array.isArray(dates) ? dates : [dates];
      chapters = Array.isArray(chapters) ? chapters : [chapters];

      subjects = subjects.filter(Boolean);

      if (!standard || !examType || subjects.length === 0) {
        return res.redirect("/teacher/timetable?error=Please+fill+all+fields");
      }

      const docs = subjects.map((subj, i) => ({
        standard,
        examType,
        subject: subj.trim(),
        examDate: new Date(dates[i] || Date.now()),
        chapters: (chapters[i] || "").trim(),
        addedBy: "teacher",
        addedById: teacher.teacherId,
        addedByName: teacher.teacherName,
      })).filter(d => d.subject);

      await ExamTimetable.insertMany(docs);
      res.redirect(`/teacher/timetable?success=${docs.length}+exam(s)+added+successfully`);
    } catch (err) {
      console.error("Teacher bulk timetable add error:", err);
      res.redirect("/teacher/timetable?error=Failed+to+add+exams");
    }
  }
);

if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`✅ Server listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
