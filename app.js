// =====================
//      Imports
// =====================
const PORT = 3000;
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const bcrypt = require("bcrypt");
const multer = require("multer");
const session = require("express-session");
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");
const Razorpay = require("razorpay"); // <-- ADDED FOR RAZORPAY
const crypto = require("crypto");     // <-- ADDED FOR RAZORPAY
require("dotenv").config();

// =====================
//      Models
// =====================
const User = require("./models/user");
const Teacher = require("./models/teacher");
const Test = require("./models/test");
const Score = require("./models/score");
const Fee = require("./models/fee");
const Attendance = require("./models/attendance");
const StudyMaterial = require("./models/StudyMaterial");

// =====================
//      App Setup
// =====================
const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 }
}));


// =====================
//   Razorpay Instance
// =====================
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});


// =====================
//      Multer Setup
// =====================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "public/uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// =====================
//   Cloudinary Setup
// =====================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadToCloudinary = (fileBuffer, folder = "student-profiles") =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image" },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    streamifier.createReadStream(fileBuffer).pipe(stream);
  });

// =====================
//   MongoDB Connection
// =====================
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error("MongoDB Connection Error:", err));

// =====================
//  Authentication Middleware
// =====================
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

// =====================
//         Routes
// =====================

// -------- Home --------
app.get("/", (req, res) => res.render("index"));

// =====================
//     Student Routes
// =====================
app.get("/student/login", (req, res) => res.render("student/login"));
app.post("/student/login", async (req, res) => {
  try {
    const { studentId, password } = req.body;
    const student = await User.findOne({ studentId });
    if (!student) return res.render("student/login", { error: "Invalid ID or password" });

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

// -------- Student Dashboard --------
app.get("/student/dashboard", requireStudentLogin, async (req, res) => {
  try {
    const student = await User.findById(req.session.userId).lean();
    if (!student) return res.redirect("/student/login");

    const attendanceCount = await Attendance.countDocuments({ "records.studentId": student.studentId });
    const testsCount = await Test.countDocuments({ standard: student.standard });

    res.render("student/dashboard", {
      student,
      stats: {
        totalAttendance: attendanceCount,
        upcomingTests: testsCount
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading dashboard");
  }
});

// -------- Student Profile --------
app.get("/student/edit_profile", requireStudentLogin, async (req, res) => {
  try {
    const student = await User.findById(req.session.userId).lean();
    if (!student) return res.redirect("/student/login");

    res.render("student/edit_profile", { student });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading edit profile page");
  }
});

app.post("/student/edit_profile", requireStudentLogin, upload.single("profilePhoto"), async (req, res) => {
  try {
    const updates = {
      studentName: req.body.studentName,
      mobileNo: req.body.mobileNo
    };

    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, { folder: "student_profiles" });
      updates.profilePhoto = result.secure_url;
    }

    await User.findByIdAndUpdate(req.session.userId, updates, { new: true });
    res.redirect("/student/dashboard");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating profile");
  }
});

// -------- Student Attendance ------
app.get("/student/attendance", requireStudentLogin, async (req, res) => {
  try {
    const student = await User.findById(req.session.userId).lean();
    if (!student) return res.status(404).send("Student not found");

    const studentId = student.studentId;
    const attendanceDocs = await Attendance.find().lean();
    const attendanceData = { overall: {} };

    attendanceDocs.forEach(doc => {
      const studentRecord = doc.records.find(r => r.studentId === studentId);
      if (studentRecord) {
        let status;
        if (studentRecord.status === "P") status = "present";
        else if (studentRecord.status === "A") status = "absent";
        else if (studentRecord.status === "H") status = "holiday";

        attendanceData.overall[doc.date] = status;
      }
    });

    res.render("student/attendance", { student, attendanceData });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching attendance");
  }
});

// -------- Student Test Scores --------
app.get("/student/test_score", requireStudentLogin, async (req, res) => {
  try {
    const studentId = req.session.userId;
    const scores = await Score.find({ studentId }).populate("testId").lean();

    const scoresBySubject = {};
    scores.forEach(score => {
      const subject = score.testId?.subject || "Unknown";
      if (!scoresBySubject[subject]) scoresBySubject[subject] = [];
      scoresBySubject[subject].push({
        testName: score.testName,
        topic: score.testId?.topic,
        score: score.score,
        subject: score.testId?.subject,
        total: score.testId?.totalMarks || 100,
        questionPaper: score.testId?.questionPaper || ""
      });
    });

    res.render("student/test_score", { scoresBySubject });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching scores");
  }
});


// -------- Student Fee Payment (MODIFIED FOR RAZORPAY) --------
app.get("/student/fee_payment", requireStudentLogin, async (req, res) => {
  try {
    const student = await User.findById(req.session.userId).lean();
    if (!student) return res.send("Student not found");

    const months = [
      "May", "June", "July", "August", "September", "October",
      "November", "December", "January", "February", "March", "April"
    ];

    const calendarToAcademic = {
      4: 0, 5: 1, 6: 2, 7: 3, 8: 4, 9: 5, 10: 6, 11: 7,
      0: 8, 1: 9, 2: 10, 3: 11
    };

    const now = new Date();
    const currentMonthIndex = now.getMonth();
    const currentAcademicIndex = calendarToAcademic[currentMonthIndex];
    const monthsElapsed = currentAcademicIndex + 1;

    // Academic year handling
    const academicStartYear = currentMonthIndex >= 4 ? now.getFullYear() : now.getFullYear() - 1;
    const yearForMonthIndex = (idx) => (idx < 8 ? academicStartYear : academicStartYear + 1);

    // Fetch all fees for this student
    const fees = await Fee.find({ studentId: student.studentId }).lean();

    // Build month-wise fee status
    const feesByMonth = months.map((month, idx) => {
      const feeYear = yearForMonthIndex(idx);
      const feeRecord = fees.find(f => f.month === month && Number(f.year) === feeYear);

      if (feeRecord) {
        return {
          _id: feeRecord._id,
          month,
          amount: Number(feeRecord.amount || 0),
          status: feeRecord.status || "Paid",
          datePaid: feeRecord.datePaid,
          year: feeYear
        };
      } else if (idx < monthsElapsed) {
        return { month, amount: Number(student.monthlyFee || 0), status: "Due", datePaid: null, year: feeYear };
      } else {
        return { month, amount: Number(student.monthlyFee || 0), status: "Not Yet Due", datePaid: null, year: feeYear };
      }
    });

    // Totals
    const monthlyFee = Number(student.monthlyFee || 0);
    const totalExpected = monthlyFee * monthsElapsed;

    const totalPaid = fees.reduce((sum, f) => {
      const idx = months.indexOf(f.month);
      if (idx === -1) return sum;
      const expectedYear = yearForMonthIndex(idx);
      if (Number(f.year) !== expectedYear) return sum;
      if (f.status !== "Paid") return sum;
      return sum + (Number(f.amount) || 0);
    }, 0);

    const totalDue = Math.max(0, totalExpected - totalPaid);

    res.render("student/fee_payment", { 
        student, 
        feesByMonth, 
        totalPaid, 
        totalDue,
        razorpayKeyId: process.env.RAZORPAY_KEY_ID // <-- PASS KEY TO EJS
    });

  } catch (err) {
    console.error(err);
    res.send("Error loading fee payment");
  }
});


// -------- Create Order --------
app.post("/create-order", requireStudentLogin, async (req, res) => {
    try {
        const { amount } = req.body;
        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'Invalid amount' });
        }
        const options = {
            amount: Math.round(amount * 100), // Amount in the smallest currency unit (paise)
            currency: 'INR',
            receipt: `receipt_order_${new Date().getTime()}`,
        };
        const order = await razorpay.orders.create(options);
        if (!order) {
            return res.status(500).send('Error creating order');
        }
        res.json(order);
    } catch (error) {
        console.error('Error in /create-order:', error);
        res.status(500).send('Server Error');
    }
});

// -------- Verify Payment --------
app.post("/verify-payment", requireStudentLogin, async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;
    const secret = process.env.RAZORPAY_KEY_SECRET;

    const shasum = crypto.createHmac('sha256', secret);
    shasum.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const digest = shasum.digest('hex');

    if (digest === razorpay_signature) {
        console.log('Payment is legitimate and verified.');
        
        try {
            const student = await User.findById(req.session.userId);
            if (!student) {
                throw new Error("Student not found for session.");
            }

            // --- START OF NEW DYNAMIC LOGIC ---
            // Re-create the logic from the fee_payment route to find which months are due
            const months = ["May", "June", "July", "August", "September", "October", "November", "December", "January", "February", "March", "April"];
            const calendarToAcademic = { 4: 0, 5: 1, 6: 2, 7: 3, 8: 4, 9: 5, 10: 6, 11: 7, 0: 8, 1: 9, 2: 10, 3: 11 };

            const now = new Date();
            const currentMonthIndex = now.getMonth();
            const currentAcademicIndex = calendarToAcademic[currentMonthIndex];
            const monthsElapsed = currentAcademicIndex + 1;

            // Find which months have already been paid by this student
            const paidFees = await Fee.find({ studentId: student.studentId }).lean();
            const paidMonths = paidFees.map(f => f.month);

            // Determine the oldest month that is due
            let dueMonth = null;
            for (let i = 0; i < monthsElapsed; i++) {
                const monthToCheck = months[i];
                if (!paidMonths.includes(monthToCheck)) {
                    dueMonth = monthToCheck; // This is the oldest due month
                    break;
                }
            }

            if (!dueMonth) {
                console.log("No due month found, but payment was made. This could be an advance payment or an error.");
                // We will still record the payment but flag it for review, or you can choose to reject it.
                // For now, we'll assign it to the current month if possible.
                dueMonth = months[calendarToAcademic[now.getMonth()]];
            }
            
            const year = now.getFullYear();

            // Create the new Fee document with the correct, dynamically found month
            const newFee = new Fee({
                studentId: student.studentId,
                studentName: student.studentName,
                standard: student.standard,
                month: dueMonth, 
                year: year,
                amount: amount,
                method: 'Online',
                status: 'Paid',
                datePaid: new Date(),
                razorpayPaymentId: razorpay_payment_id
            });
            await newFee.save();
            console.log(`Fee record created for ${dueMonth} for payment ID: ${razorpay_payment_id}`);
            // --- END OF NEW DYNAMIC LOGIC ---

        } catch(dbError) {
            console.error('Error saving fee to DB after payment verification:', dbError);
            // Even if DB save fails, we must inform Razorpay. But we should log this error for admin.
        }

        res.json({
            status: 'success',
            orderId: razorpay_order_id,
            paymentId: razorpay_payment_id,
        });
    } else {
        res.status(400).json({ status: 'failure', message: 'Invalid signature.' });
    }
});


app.get("/student/take_test", requireStudentLogin, async (req, res) => {
  try {
    const studentStandard = req.user.standard;
    const subject = req.query.subject || "overall"; // default overall 
    let query = { standard: studentStandard };
    if (subject !== "overall") {
      query.subject = subject; // filter only for that subject 
    }
    const tests = await Test.find(query).lean();
    res.render("student/take_test", { tests, studentStandard, subject });
  }
  catch (err) {
    console.error(err); res.status(500).send("Error loading tests");

  }
});
// -------- Student Receipt PDF --------
const { jsPDF } = require("jspdf");
app.get("/student/receipt/:feeId", requireStudentLogin, async (req, res) => {
  try {
    const fee = await Fee.findById(req.params.feeId).lean();
    if (!fee) return res.send("Receipt not found");

    const student = await User.findOne({ studentId: fee.studentId }).lean();
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Tuition Hub - Fee Receipt", 105, 20, { align: "center" });

    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text("123 Tuition Lane, Mumbai, India", 105, 28, { align: "center" });
    doc.text("Phone: +91 9876543210 | Email: support@classconnect.com", 105, 34, { align: "center" });
    doc.line(20, 38, 190, 38);

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Payment Receipt", 105, 50, { align: "center" });

    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(`Student Name: ${student.studentName}`, 20, 70);
    doc.text(`Student ID: ${student.studentId}`, 20, 80);
    doc.text(`Class: ${student.standard}`, 20, 90);

    doc.setFont("helvetica", "bold");
    doc.text("Payment Details", 20, 110);
    doc.setFont("helvetica", "normal");
    doc.rect(20, 115, 170, 40);

    doc.text(`Month: ${fee.month}`, 30, 125);
    doc.text(`Amount Paid: ₹${fee.amount}`, 30, 135);
    doc.text(`Date Paid: ${new Date(fee.datePaid).toDateString()}`, 30, 145);
    doc.text(`Payment Status: ${fee.status}`, 30, 155);

    doc.setFontSize(10);
    doc.text("This is a computer-generated receipt and does not require a signature.", 105, 280, { align: "center" });

    const pdf = doc.output();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=receipt-${fee._id}.pdf`);
    res.send(pdf);

  } catch (err) {
    console.error(err);
    res.send("Error generating receipt");
  }
});

// -------- Student Content --------
app.get("/student/content", requireStudentLogin, async (req, res) => {
  try {
    const student = await User.findById(req.session.userId).lean();
    if (!student) return res.status(404).send("Student not found");

    const [materials, tests] = await Promise.all([
      StudyMaterial.find({ standard: student.standard }).sort({ uploadedAt: -1 }).lean(),
      Test.find({ standard: student.standard }).sort({ createdAt: -1 }).lean()
    ]);

    res.render("student/content", { student, materials, tests });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading class content");
  }
});

// -------- Student Leaderboard --------
app.get("/student/leader_board", requireStudentLogin, async (req, res) => {
  try {
    const students = await User.find().lean();
    students.forEach(s => { if (typeof s.points !== "number") s.points = 0; });
    students.sort((a, b) => b.points - a.points);

    const leaderboard = students.map((s, index) => ({
      rank: index + 1,
      name: s.studentName,
      studentId: s.studentId,
      score: s.points,
      avatar: s.profilePhoto || s.studentName.split(' ').map(n => n[0]).join('').toUpperCase()
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
});

// -------- Student Logout --------
app.get("/student/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error("Logout error:", err);
      return res.status(500).send("Logout failed");
    }
    res.redirect("/student/login");
  });
});

// =====================
//     Teacher Routes
// =====================
// --- ALL YOUR EXISTING TEACHER ROUTES GO HERE ---
// --- OMITTED FOR BREVITY, PLEASE KEEP YOURS IN PLACE ---

app.get("/teacher/login", (req, res) => {
  res.render("teacher/login"); // initially no error
});

app.post("/teacher/login", async (req, res) => {
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



app.get("/teacher/dashboard", requireTeacherLogin, async (req, res) => {
  const teacher = await Teacher.findById(req.session.userId);
  if (!teacher) return res.redirect("/teacher/login");
  res.render("teacher/dashboard", { teacher });
});

app.get("/teacher/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error("Logout error:", err);
      return res.status(500).send("Logout failed");
    }
    res.redirect("/teacher/login");
  });
});


// =====================
//   Teacher Management
// =====================
// Add/Edit Teacher, Students, Attendance, Tests, Fees
// ... (similar formatting can be applied here for remaining routes)

app.get("/teacher/add_teacher", requireTeacherLogin, (req, res) => res.render("teacher/add_teacher"));
app.post("/teacher/add_teacher", requireTeacherLogin, async (req, res) => {
  try {
    const { teacherId, teacherName, email, subjects, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 12);

    const newTeacher = new Teacher({ teacherId, teacherName, email, subjects, password: hashedPassword });
    await newTeacher.save();
    res.send("Teacher added successfully!");
  } catch (err) {
    console.error(err);
    if (err.code === 11000) res.status(400).send("Teacher ID already exists");
    else res.status(500).send("Failed to add teacher");
  }
});
app.get("/teacher/edit_teacher/:id", requireTeacherLogin, async (req, res) => {
  const teacher = await Teacher.findById(req.params.id).lean();
  if (!teacher) return res.status(404).send("Teacher not found");
  res.render("teacher/edit_teacher", { teacher });
});
app.post("/teacher/edit_teacher/:id", requireTeacherLogin, async (req, res) => {
  const { teacherName, email, subjects, password } = req.body;
  const updateData = { teacherName, email, subjects };
  if (password && password.trim() !== "") updateData.password = await bcrypt.hash(password, 12);
  await Teacher.findByIdAndUpdate(req.params.id, updateData);
  res.redirect(`/teacher/edit_teacher/${req.params.id}`);
});

// =====================
//    Student Management
// =====================
app.get("/teacher/manage_students", requireTeacherLogin, async (req, res) => {
  const students = await User.find().lean();
  res.render("teacher/manage_students", { students });
});
app.get("/teacher/add_student", requireTeacherLogin, (req, res) => res.render("teacher/add_student"));
app.post("/teacher/add_student", requireTeacherLogin, upload.single("profilePhoto"), async (req, res) => {
  try {
    const { standard, studentId, studentName, password, mobileNo, monthlyFee } = req.body;
    const hashedPassword = await bcrypt.hash(password, 12);

    let profilePhotoUrl = null;
    if (req.file) {
      const uploadResult = await cloudinary.uploader.upload(req.file.path, { folder: "student-profiles" });
      profilePhotoUrl = uploadResult.secure_url;
    }

    const newStudent = new User({
      standard,
      studentId,
      studentName,
      password: hashedPassword,
      mobileNo,
      monthlyFee,
      profilePhoto: profilePhotoUrl
    });
    await newStudent.save();
    res.send("Student added successfully!");
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to add student");
  }
});

// View/Edit student profile
app.get("/teacher/view_profile/:id", requireTeacherLogin, async (req, res) => {
  const student = await User.findById(req.params.id).lean();
  if (!student) return res.status(404).send("Student not found");
  res.render("teacher/view_profile", { student });
});
app.get("/teacher/edit_profile/:id", requireTeacherLogin, async (req, res) => {
  const student = await User.findById(req.params.id).lean();
  if (!student) return res.status(404).send("Student not found");
  res.render("teacher/edit_profile", { student });
});
app.post("/teacher/edit_profile/:id", requireTeacherLogin, upload.single("profilePhoto"), async (req, res) => {
  try {
    const { studentName, standard, mobileNo } = req.body;
    const updateData = { studentName, standard, mobileNo };

    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "student-profiles"
      });
      updateData.profilePhoto = result.secure_url;
    }

    await User.findByIdAndUpdate(req.params.id, updateData);
    res.redirect(`/teacher/view_profile/${req.params.id}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating profile");
  }
});


// =====================
//      Attendance
// =====================
app.get("/teacher/manage_attendance", requireTeacherLogin, async (req, res) => {
  const students = await User.find().lean();
  const attendanceRecords = await Attendance.find().lean();

  const attendanceMap = {};
  attendanceRecords.forEach((record) => {
    attendanceMap[record.date] = {};
    (record.records || []).forEach((r) => (attendanceMap[record.date][r.studentId] = r.status));
  });

  res.render("teacher/manage_attendance", { students, attendance: attendanceMap });
});
app.post("/teacher/manage_attendance", requireTeacherLogin, async (req, res) => {
  const { date, records } = req.body;
  let attendance = await Attendance.findOne({ date });
  if (attendance) attendance.records = records;
  else attendance = new Attendance({ date, records });
  await attendance.save();
  res.json({ success: true, message: "Attendance saved successfully!" });
});

// =====================
//      Tests
// =====================
app.get("/teacher/add_test", requireTeacherLogin, (req, res) => res.render("teacher/add_test"));
app.post("/teacher/add_test", requireTeacherLogin, upload.single("questionPaper"), async (req, res) => {
  try {
    const { testName, standard, subject, topic, totalMarks } = req.body;

    let questionPaperUrl = null;
    if (req.file) {
      const uploadResult = await cloudinary.uploader.upload(req.file.path, {
        folder: "tests",
        resource_type: "raw"
      });
      questionPaperUrl = uploadResult.secure_url;
    }

    const newTest = new Test({
      testName,
      standard,
      subject,
      topic,
      totalMarks,
      questionPaper: questionPaperUrl
    });

    await newTest.save();
    res.send("✅ Test created successfully!");
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Failed to add test");
  }
});

app.get("/teacher/manage_tests", requireTeacherLogin, async (req, res) => {
  const tests = await Test.find().lean();
  res.render("teacher/manage_tests", { tests });
});
app.post("/teacher/delete_test/:id", requireTeacherLogin, async (req, res) => {
  await Test.findByIdAndDelete(req.params.id);
  res.redirect("/teacher/manage_tests");
});
// =====================
//      Fees
// =====================

// GET Add Fee Page
app.get("/teacher/add_fees", requireTeacherLogin, async (req, res) => {
  const users = await User.find({}, "studentId studentName standard").sort({ studentId: 1 });
  res.render("teacher/add_fees", { users });
});

// POST Add Fee
app.post("/teacher/add_fees", requireTeacherLogin, async (req, res) => {
  try {
    const { studentId, studentName, standard, month, year, amount, method, datePaid } = req.body;

    const newFee = new Fee({
      studentId,
      studentName,
      standard,
      month,
      year,
      amount,
      method,
      datePaid
    });

    await newFee.save();
    res.json({ success: true, message: "Fee added successfully!" });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "Error saving fee!" });
  }
});

app.get("/teacher/manage_fees", requireTeacherLogin, async (req, res) => {
  try {
    // Fetch all students
    const students = await User.find({}, "studentId studentName standard").lean();

    // Fetch all fees
    const fees = await Fee.find().lean();

    const months = ["May", "June", "July", "August", "September", "October", "November", "December", "January", "February", "March", "April"];

    const studentsWithFees = students.map(student => {
      // Compare strings directly
      const studentFees = fees.filter(f => f.studentId === student.studentId);

      const feeMap = {};
      months.forEach(month => {
        const feeRecord = studentFees.find(f => f.month === month);
        feeMap[month] = feeRecord ? feeRecord.datePaid.toISOString().split("T")[0] : null;
      });

      return {
        studentName: student.studentName,
        studentId: student.studentId, // display your custom ID
        standard: student.standard,
        fees: feeMap
      };
    });

    res.render("teacher/manage_fees", { studentsWithFees, months });
  } catch (err) {
    console.error(err);
    res.send("Error loading fees");
  }
});


// =====================
//      Scores API
// =====================
app.get("/teacher/manage_score", requireTeacherLogin, async (req, res) => {
  const users = await User.find({});
  const standards = [...new Set(users.map(u => u.standard))].sort();
  res.render("teacher/manage_score", { standards });
});

app.get("/api/tests/:standard", requireTeacherLogin, async (req, res) => {
  const tests = await Test.find({ standard: req.params.standard });
  res.json(tests);
});

// Fetch students and scores for a test
app.get("/api/scores/:standard/:testId", requireTeacherLogin, async (req, res) => {
  const { standard, testId } = req.params;
  const students = await User.find({ standard }).lean();

  const studentScores = await Promise.all(students.map(async s => {
    const scoreDoc = await Score.findOne({ studentId: s.studentId, testId });
    return {
      _id: s._id,
      studentId: s.studentId,
      studentName: s.studentName,
      score: scoreDoc ? scoreDoc.score : "",
      percentage: scoreDoc ? scoreDoc.percentage : "-"
    };
  }));

  // Return array directly (not wrapped in object)
  res.json(studentScores);
});

// Save scores with percentage
app.post("/api/scores/save", requireTeacherLogin, async (req, res) => {
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
        percentage: percent
      },
      { upsert: true, new: true }
    );
  }

  res.json({ message: "Scores saved successfully!" });
});

// Consolidated classwise scores (read percentage)
app.get("/api/scores/consolidated_classwise", requireTeacherLogin, async (req, res) => {
  const classes = ['5', '6', '7', '8', '9', '10'];
  const result = {};

  for (let cls of classes) {
    const students = await User.find({ standard: cls }).sort({ studentName: 1 });
    const tests = await Test.find({ standard: cls }).sort({ createdAt: 1 });
    const scores = await Score.find({ standard: cls });

    const studentRows = students.map(s => ({
      studentId: s.studentId,
      studentName: s.studentName,
      scores: {} // testId -> percentage
    }));

    scores.forEach(sc => {
      const row = studentRows.find(r => r.studentId === sc.studentId);
      if (row) row.scores[sc.testId.toString()] = sc.percentage;
    });

    result[cls] = {
      tests: tests.map(t => ({
        _id: t._id,
        testName: t.testName,
        subject: t.subject
      })),
      students: studentRows
    };
  }

  res.json(result);
});

// =====================
//     Study Material
// =====================
app.get("/teacher/study_material", requireTeacherLogin, async (req, res) => {
  const materials = await StudyMaterial.find().sort({ uploadedAt: -1 }).lean();
  res.render("teacher/study_material", { materials });
});
app.post("/teacher/study_material", requireTeacherLogin, upload.single("file"), async (req, res) => {
  try {
    const { standard, subject, materialType, description, link } = req.body;

    let filePath = null;

    if (req.file) {
      const uploadResult = await cloudinary.uploader.upload(req.file.path, {
        folder: "study-materials",
        resource_type: "raw"   // 👈 for pdf/docx
      });
      filePath = uploadResult.secure_url;
    } else if (link) {
      filePath = link; // external link
    }

    if (!filePath) {
      return res.json({ success: false, message: "Please upload a file or provide a link." });
    }

    const newMaterial = new StudyMaterial({
      standard,
      subject,
      materialType,
      description,
      filePath
    });

    await newMaterial.save();

    res.json({ success: true, message: "📚 Material uploaded successfully!" });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "❌ Failed to upload material" });
  }
});

// =====================
//     Start Server
// =====================
app.listen(PORT, () => console.log(`✅ Server listening on http://localhost:${PORT}`));