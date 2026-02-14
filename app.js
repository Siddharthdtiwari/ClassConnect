const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const bcrypt = require("bcrypt");
const multer = require("multer");
const session = require("express-session");
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");
const Razorpay = require("razorpay");
const crypto = require("crypto");
require("dotenv").config();

const User = require("./models/user");
const Teacher = require("./models/teacher");
const Test = require("./models/test");
const Score = require("./models/score");
const Fee = require("./models/fee");
const Attendance = require("./models/attendance");
const StudyMaterial = require("./models/StudyMaterial");

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
    cookie: { maxAge: 1000 * 60 * 60 },
  })
);

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const storage = multer.memoryStorage();
const upload = multer({ storage });

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
  if (!req.session.userId) return res.redirect("/teacher/login");
  next();
};

const requireStudentLogin = async (req, res, next) => {
  if (!req.session.userId) return res.redirect("/student/login");

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

// -------- Home --------
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
        totalDays > 0 ? ((presentDays / (presentDays+absentDays)) * 100).toFixed(1) : 0;

      const scoreLabels = recentScores.map((score) => score.testName).reverse();
      const scoreData = recentScores.map((score) => score.percentage).reverse();

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
      });

    } catch (err) {
      console.error(err);
      res.status(500).send("Error loading dashboard");
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

          // ✅ Format the `date` (stored as string) into YYYY-MM-DD
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
      const monthsElapsed = currentAcademicIndex + 1;

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
        const monthsElapsed = currentAcademicIndex + 1;

        const paidFees = await Fee.find({
          studentId: student.studentId,
        }).lean();
        const paidMonths = paidFees.map((f) => f.month);

        let dueMonth = null;
        for (let i = 0; i < monthsElapsed; i++) {
          const monthToCheck = months[i];
          if (!paidMonths.includes(monthToCheck)) {
            dueMonth = monthToCheck;
            break;
          }
        }

        if (!dueMonth) {
          console.log(
            "No due month found, but payment was made. This could be an advance payment or an error."
          );
          dueMonth = months[calendarToAcademic[now.getMonth()]];
        }

        const year = now.getFullYear();

        const newFee = new Fee({
          studentId: student.studentId,
          studentName: student.studentName,
          standard: student.standard,
          month: dueMonth,
          year: year,
          amount: amount,
          method: "Online",
          status: "Paid",
          datePaid: new Date(),
          razorpayPaymentId: razorpay_payment_id,
        });
        await newFee.save();
        console.log(
          `Fee record created for ${dueMonth} for payment ID: ${razorpay_payment_id}`
        );
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

app.get(
  "/student/receipt/:feeId",
  ensureDBConnection,
  requireStudentLogin,
  async (req, res) => {
    try {
      const fee = await Fee.findById(req.params.feeId).lean();
      if (!fee) return res.send("Receipt not found");

      const student = await User.findOne({ studentId: fee.studentId }).lean();

      const doc = new PDFDocument({ size: "A4", margin: 50 });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=receipt-${fee._id}.pdf`
      );
      doc.pipe(res);

      const headerUrl = process.env.CLOUDINARY_HEADER_URL;
      if (headerUrl) {
        const response = await axios.get(headerUrl, {
          responseType: "arraybuffer",
        });
        const imgBuffer = Buffer.from(response.data, "binary");
        doc.image(imgBuffer, (doc.page.width - 400) / 2, 30, {
          fit: [400, 80],
        });
      }

      doc.moveDown(5);

      doc
        .fontSize(20)
        .font("Helvetica-Bold")
        .text("PAYMENT RECEIPT", { align: "center", underline: true });
      doc.moveDown(2);

      doc.fontSize(12);

      doc.font("Helvetica").text("Student Name: ", { continued: true });
      doc.font("Helvetica-Bold").text(student.studentName);

      doc.font("Helvetica").text("Student ID: ", { continued: true });
      doc.font("Helvetica-Bold").text(student.studentId);

      doc.font("Helvetica").text("Class: ", { continued: true });
      doc.font("Helvetica-Bold").text(student.standard);

      doc.moveDown(2);

      doc
        .font("Helvetica-Bold")
        .fontSize(14)
        .text("Payment Details", { underline: true });
      doc.moveDown(1);

      const labelX = 60;
      const valueX = 220;
      let lineY = doc.y;

      function addDetail(label, value) {
        doc.font("Helvetica").fontSize(12).text(label, labelX, lineY);
        doc.font("Helvetica-Bold").text(value, valueX, lineY);
        lineY += 20;
      }

      addDetail("Month", `${fee.month} ${fee.year}`);
      addDetail("Amount Paid", `${fee.amount}rs`);
      addDetail("Date Paid", new Date(fee.datePaid).toDateString());
      addDetail("Payment Method", fee.method);
      addDetail("Status", fee.status);

      doc.moveDown(4);

      doc
        .font("Helvetica-Oblique")
        .fontSize(10)
        .fillColor("gray")
        .text(
          "This is a computer-generated receipt and does not require a signature.",
          { align: "center" }
        );

      doc.end();
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
    const teacher = await Teacher.findById(req.session.userId);
    if (!teacher) return res.redirect("/teacher/login");
    res.render("teacher/dashboard", { teacher });
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
    const student = await User.findById(req.params.id).lean();
    if (!student) return res.status(404).send("Student not found");

    const studentId = student.studentId;

    const recentFees = await Fee.find({ studentId: studentId, status: "Paid" })
      .sort({ datePaid: -1 })
      .limit(6)
      .lean();

    const recentScores = await Score.find({ studentId: studentId })
      .sort({ createdAt: -1 })
      .limit(5)
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
      totalDays > 0 ? ((presentDays / (presentDays+absentDays)) * 100).toFixed(1) : 0;

    const scoreLabels = recentScores.map((score) => score.testName).reverse();
    const scoreData = recentScores.map((score) => score.percentage).reverse();

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
    });
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
    const { date, records } = req.body;
    let attendance = await Attendance.findOne({ date });
    if (attendance) attendance.records = records;
    else attendance = new Attendance({ date, records });
    await attendance.save();
    res.json({ success: true, message: "Attendance saved successfully!" });
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
          s.percentage = s.total > 0 ? (s.present /( s.present + s.absent)) * 100 : 0;
          return s;
        })
        .filter((s) => s.percentage < 75);

      res.render("teacher/defaulters", { year, month, defaulters });
    } catch (err) {
      console.error(err);
      res.status(500).send("Error generating defaulter list");
    }
  }
);

app.get(
  "/teacher/detailed_attendance",
  ensureDBConnection,
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

app.get(
  "/teacher/add_fees",
  ensureDBConnection,
  requireTeacherLogin,
  async (req, res) => {
    const users = await User.find({}, "studentId studentName standard monthlyFee").sort({
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
      const students = await User.find({}, "studentId studentName standard").lean();
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

app.get(
  "/teacher/manage_score",
  ensureDBConnection,
  requireTeacherLogin,
  async (req, res) => {
    const users = await User.find({});
    const standards = [...new Set(users.map((u) => u.standard))].sort();
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
    const { standard, testId } = req.params;
    const students = await User.find({ standard }).lean();

    const studentScores = await Promise.all(
      students.map(async (s) => {
        const scoreDoc = await Score.findOne({
          studentId: s.studentId,
          testId,
        });
        return {
          _id: s._id,
          studentId: s.studentId,
          studentName: s.studentName,
          score: scoreDoc ? scoreDoc.score : "",
          percentage: scoreDoc ? scoreDoc.percentage : "-",
        };
      })
    );

    res.json(studentScores);
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
      const percent = ((s.score / test.totalMarks) * 100).toFixed(2);

      await Score.findOneAndUpdate(
        { studentId: s.studentId, testId },
        {
          studentId: s.studentId,
          studentName: student.studentName,
          standard: student.standard,
          testId,
          testName: test.testName,
          score: s.score,
          percentage: percent,
        },
        { upsert: true, new: true }
      );
      const additionalPoints = parseFloat(percent);
      await User.findOneAndUpdate(
        { studentId: s.studentId },
        { $inc: { points: additionalPoints } }
      );
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
        studentName: 1,
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

if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`✅ Server listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
