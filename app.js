const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const nodemailer = require("nodemailer");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const winston = require("winston");
require("winston-daily-rotate-file");
const { csrfSync } = require("csrf-sync");
require("dotenv").config();

// 1. Environment Variable Validation
const requiredEnv = ["MONGODB_URI", "SESSION_SECRET"];
const missingEnv = requiredEnv.filter(env => !process.env[env]);
if (missingEnv.length > 0) {
  console.error(`❌ CRITICAL: Missing required environment variables: ${missingEnv.join(", ")}`);
  process.exit(1);
}

// 2. Structured Logging Setup
const isServerless = !!process.env.VERCEL;
const logTransports = [
  new winston.transports.Console({
    format: winston.format.simple(),
  })
];

if (!isServerless) {
  const logDirectory = path.join(__dirname, "logs");
  if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory, { recursive: true });
  }

  logTransports.unshift(new winston.transports.DailyRotateFile({
    filename: path.join(logDirectory, "application-%DATE%.log"),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d'
  }));
}

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: logTransports
});

// Override global console.log and console.error
console.log = (...args) => logger.info(args.join(' '));
console.error = (...args) => logger.error(args.join(' '));

const { ensureDBConnection, connectDB } = require("./middlewares/auth");
const { calculateCurrentAcademicYear, getAvailableAcademicYears } = require("./utils/academicYear");
const { sendContactConfirmation } = require("./utils/emailService");

const app = express();
app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          "https://cdn.tailwindcss.com",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com",
          "https://checkout.razorpay.com",
        ],
        // Helmet 8.x separates inline event handler (onclick=) policy from
        // script-src-elem. We need 'unsafe-inline' here to allow onclick attrs.
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
          "https://cdn.tailwindcss.com",
        ],
        fontSrc: [
          "'self'",
          "https://fonts.gstatic.com",
          "https://fonts.googleapis.com",
        ],
        imgSrc: [
          "'self'",
          "data:",
          "https://placehold.co",
          "https://images.unsplash.com",
          "https://res.cloudinary.com",
          "https://*",
        ],
        connectSrc: [
          "'self'",
          "https://api.razorpay.com",
        ],
        frameSrc: [
          "'self'",
          "https://api.razorpay.com",
          "https://checkout.razorpay.com",
        ],
      },
    },
  })
);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// HTTP Request Logging
app.use(morgan('dev', { stream: { write: message => logger.info(message.trim()) } }));

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
    cookie: { 
      maxAge: 1000 * 60 * 60, 
      httpOnly: true, 
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production"
    },
  })
);

// 3. CSRF Protection
const { csrfSynchronisedProtection } = csrfSync({
  getTokenFromRequest: (req) => {
    return req.body["_csrf"] || req.query["_csrf"] || req.headers["x-csrf-token"];
  }
});
app.use(csrfSynchronisedProtection);

// Inject CSRF Token into all views
app.use((req, res, next) => {
  res.locals.csrfToken = req.csrfToken();
  next();
});

// Academic Year Context Middleware
// Auto-calculates and injects current academic year into all requests
app.use((req, res, next) => {
  // Auto-calculate current academic year (May-April cycle)
  req.currentAcademicYear = calculateCurrentAcademicYear();

  // Determine user role
  req.isStudent = req.session?.role === 'student';
  req.isTeacher = req.session?.role === 'teacher';

  // Teachers can view different years via query param (?year=2023-2024)
  // Students ALWAYS see only the current year
  if (req.isTeacher) {
    if (req.query.year && req.query.year !== req.session.academicYear) {
      req.session.academicYear = req.query.year;
      return req.session.save((err) => {
        if (err) console.error("Error saving session:", err);
        req.viewingYear = req.session.academicYear || req.currentAcademicYear;
        res.locals.currentAcademicYear = req.currentAcademicYear;
        res.locals.viewingYear = req.viewingYear;
        res.locals.availableYears = getAvailableAcademicYears(5);
        res.locals.isTeacher = req.isTeacher;
        res.locals.isStudent = req.isStudent;
        next();
      });
    }
    req.viewingYear = req.session.academicYear || req.currentAcademicYear;
  } else {
    req.viewingYear = req.currentAcademicYear;
  }

  res.locals.currentAcademicYear = req.currentAcademicYear;
  res.locals.viewingYear = req.viewingYear;
  res.locals.availableYears = getAvailableAcademicYears(5);
  res.locals.isTeacher = req.isTeacher;
  res.locals.isStudent = req.isStudent;

  next();
});

const contactTransport = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.CONTACT_EMAIL_USER,
    pass: process.env.CONTACT_EMAIL_PASS,
  },
});

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: "Too many contact requests from this IP, please try again after an hour"
});

// 4. Health Check Endpoint
app.get("/health", (req, res) => {
  const isUp = mongoose.connection.readyState === 1;
  res.status(isUp ? 200 : 503).json({
    status: isUp ? "UP" : "DOWN",
    timestamp: new Date()
  });
});

app.get("/", ensureDBConnection, async (req, res) => {
  try {
    const User = require("./models/User");
    const Batch = require("./models/Batch");
    
    // Find active students in the current academic year
    let targetYear = req.currentAcademicYear;
    let batches = await Batch.find({ academicYear: targetYear }).select('_id').lean();
    let activeBatches = batches.map(b => b._id);
    let students = await User.find({ batch: { $in: activeBatches } }).lean();
    
    // If no students or no one has any points, fallback to previous year's leaderboard
    const hasPoints = students.some(s => s.points > 0);
    if (!hasPoints) {
      const startYear = parseInt(targetYear.split('-')[0]);
      targetYear = `${startYear - 1}-${String(startYear).slice(2)}`;
      batches = await Batch.find({ academicYear: targetYear }).select('_id').lean();
      activeBatches = batches.map(b => b._id);
      students = await User.find({ batch: { $in: activeBatches } }).lean();
    }
    
    students.forEach(s => {
      if (typeof s.points !== "number") s.points = 0;
    });
    students.sort((a, b) => b.points - a.points);

    const topStudents = students.slice(0, 3).map((s, index) => ({
      rank: index + 1,
      name: s.studentName,
      score: s.points,
      avatar: s.profilePhoto || s.studentName.split(" ").map(n => n[0]).join("").toUpperCase(),
      year: targetYear
    }));

    res.render("index", { topStudents });
  } catch (err) {
    console.error("Error loading landing page leaderboard:", err);
    res.render("index", { topStudents: [] });
  }
});

app.post("/contact", contactLimiter, async (req, res) => {
  const { name, email, phone, role, message } = req.body || {};
  if (!name || !email || !message) {
    return res.status(400).json({ error: "Name, email, and message are required." });
  }

  if (!process.env.CONTACT_EMAIL_USER || !process.env.CONTACT_EMAIL_PASS) {
    return res.status(500).json({ error: "Email service is not configured." });
  }

  const toAddress = process.env.CONTACT_EMAIL_TO || process.env.CONTACT_EMAIL_USER;
  const subject = `Inquiry: Tuition Hub Education Centre - ${name}${role ? ` (${role})` : ""}`;
  const bodyText = [
    `Name: ${name}`,
    `Email: ${email}`,
    `Phone: ${phone || ""}`,
    `Role: ${role || ""}`,
    "",
    message,
  ].join("\n");

  const htmlContent = `
<div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eaeaea; border-radius: 8px; overflow: hidden;">
  <div style="background-color: #f8f9fa; padding: 25px 20px; border-bottom: 1px solid #eaeaea; text-align: center;">
    <img src="cid:tuitionhublogo" alt="Tuition Hub Logo" style="height: 50px; margin-bottom: 15px; display: inline-block;">
    <h2 style="margin: 0; color: #333; font-size: 20px; font-weight: 600;">New Inquiry Received</h2>
  </div>
  <div style="padding: 30px;">
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; width: 30%; color: #666; font-weight: 600;">Name</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; color: #333;">${name}</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; color: #666; font-weight: 600;">Email</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; color: #333;"><a href="mailto:${email}" style="color: #7c3aed; text-decoration: none;">${email}</a></td>
      </tr>
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; color: #666; font-weight: 600;">Phone</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; color: #333;">${phone || 'N/A'}</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; color: #666; font-weight: 600;">Role</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; color: #333;">${role || 'N/A'}</td>
      </tr>
    </table>
    <div style="margin-top: 25px;">
      <p style="margin: 0 0 10px; color: #666; font-weight: 600;">Message:</p>
      <div style="background-color: #f8f9fa; padding: 15px; border-radius: 6px; color: #333; line-height: 1.6; border: 1px solid #eaeaea;">
        ${message.replace(/\n/g, '<br>')}
      </div>
    </div>
  </div>
</div>
  `;

  try {
    await contactTransport.sendMail({
      from: `"Tuition Hub Education Centre" <${process.env.CONTACT_EMAIL_USER}>`,
      replyTo: email,
      to: toAddress,
      subject,
      text: bodyText,
      html: htmlContent,
      attachments: [{
        filename: 'logo.png',
        path: require('path').join(__dirname, 'public', 'images', 'logo.png'),
        cid: 'tuitionhublogo'
      }]
    });

    // Send confirmation back to the person who inquired
    try {
      await sendContactConfirmation(email, name, message);
    } catch (confirmErr) {
      console.error("Confirmation email failed (non-critical):", confirmErr);
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("Contact email failed:", err);
    return res.status(500).json({ error: "Failed to send message. Please call us directly." });
  }
});

// =====================
//     Student Routes
// =====================

// Mount Routes
const studentRoutes = require('./routes/studentRoutes');
const teacherRoutes = require('./routes/teacherRoutes');
app.use(studentRoutes);
app.use(teacherRoutes);

// ======== ERROR HANDLING MIDDLEWARE ========

// 404 Error Handler - Route not found
app.use((req, res) => {
  res.status(404).render('error/404', {
    url: req.originalUrl,
    method: req.method
  });
});

// CSRF Error Handler
app.use((err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).send('Form tampered or session expired. Please refresh the page and try again.');
  }
  next(err);
});

// 500 Error Handler - General server errors
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err);
  const isDev = process.env.NODE_ENV !== 'production';

  res.status(err.status || 500).render('error/500', {
    error: isDev ? err : {},
    message: err.message || 'Internal Server Error'
  });
});

// 5. Graceful Shutdown
let server;
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  server = app.listen(PORT, () => {
    console.log(`✅ Server listening on http://localhost:${PORT}`);
    // Connect to Database immediately on startup
    connectDB().catch(err => console.error("Database connection failed on startup:", err));
  });
} else {
  const PORT = process.env.PORT || 80;
  server = app.listen(PORT, () => {
    console.log(`✅ Production server listening on port ${PORT}`);
    // Connect to Database immediately on startup
    connectDB().catch(err => console.error("Database connection failed on startup:", err));
  });
}

const shutdown = () => {
  console.log('SIGTERM/SIGINT received, shutting down gracefully');
  if (server) {
    server.close(async () => {
      console.log('HTTP server closed');
      await mongoose.connection.close(false);
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = app;
