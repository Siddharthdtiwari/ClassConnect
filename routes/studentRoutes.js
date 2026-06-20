const express = require('express');
const router = express.Router();
const catchAsync = require('../utils/catchAsync');

const { ensureDBConnection, requireStudentLogin } = require("../middlewares/auth");
const { upload } = require("../utils/upload");
const rateLimit = require("express-rate-limit");

const authController = require("../controllers/student/authController");
const dashboardController = require("../controllers/student/dashboardController");
const profileController = require("../controllers/student/profileController");
const attendanceController = require("../controllers/student/attendanceController");
const testController = require("../controllers/student/testController");
const feeController = require("../controllers/student/feeController");
const contentController = require("../controllers/student/contentController");
const timetableController = require("../controllers/student/timetableController");
const leaderboardController = require("../controllers/student/leaderboardController");

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many login attempts, please try again after 15 minutes"
});

// Authentication
router.get("/student/login", catchAsync(authController.renderLogin));
router.post("/student/login", loginLimiter, ensureDBConnection, catchAsync(authController.processLogin));
router.get("/student/logout", catchAsync(authController.processLogout));

// Dashboard & Reports
router.get("/student/dashboard", ensureDBConnection, requireStudentLogin, catchAsync(dashboardController.renderDashboard));
router.get("/student/report", ensureDBConnection, requireStudentLogin, catchAsync(dashboardController.generateReport));

// Profile
router.get("/student/edit_profile", ensureDBConnection, requireStudentLogin, catchAsync(profileController.renderEditProfile));
router.post("/student/edit_profile", ensureDBConnection, requireStudentLogin, upload.single("profilePhoto"), catchAsync(profileController.processEditProfile));

// Attendance
router.get("/student/attendance", ensureDBConnection, requireStudentLogin, catchAsync(attendanceController.renderAttendance));

// Test Scores
router.get("/student/test_score", ensureDBConnection, requireStudentLogin, catchAsync(testController.renderTestScore));
router.get("/student/take_test", ensureDBConnection, requireStudentLogin, catchAsync(testController.renderTakeTest));

// Fees
router.get("/student/fee_payment", ensureDBConnection, requireStudentLogin, catchAsync(feeController.renderFeePayment));
router.get("/student/fee_summary", ensureDBConnection, requireStudentLogin, catchAsync(feeController.downloadFeeSummary));
router.post("/create-order", ensureDBConnection, requireStudentLogin, catchAsync(feeController.createOrder));
router.post("/verify-payment", ensureDBConnection, requireStudentLogin, catchAsync(feeController.verifyPayment));

// Content & Timetable
router.get("/student/content", ensureDBConnection, requireStudentLogin, catchAsync(contentController.renderContent));
router.get("/student/timetable", ensureDBConnection, requireStudentLogin, catchAsync(timetableController.renderTimetable));
router.post("/student/timetable/bulk", ensureDBConnection, requireStudentLogin, catchAsync(timetableController.processTimetableBulk));
router.post("/student/timetable/edit/:id", ensureDBConnection, requireStudentLogin, catchAsync(timetableController.processTimetableEdit));
router.post("/student/timetable/delete/:id", ensureDBConnection, requireStudentLogin, catchAsync(timetableController.processTimetableDelete));

// Leaderboard
router.get("/student/leader_board", ensureDBConnection, requireStudentLogin, catchAsync(leaderboardController.renderLeaderboard));

// Receipts
router.get("/student/receipt/:feeId", ensureDBConnection, requireStudentLogin, catchAsync(feeController.downloadReceipt));
router.get("/student/receipt/:feeId/view", ensureDBConnection, requireStudentLogin, catchAsync(feeController.viewReceipt));

module.exports = router;
