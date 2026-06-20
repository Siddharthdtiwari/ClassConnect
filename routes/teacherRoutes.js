const express = require('express');
const router = express.Router();
const catchAsync = require('../utils/catchAsync');
const rateLimit = require("express-rate-limit");
const { ensureDBConnection, requireTeacherLogin } = require("../middlewares/auth");
const { loadBatches } = require("../middlewares/batchContext");
const { upload } = require("../utils/upload");

// Controllers
const authController = require("../controllers/teacher/authController");
const batchController = require("../controllers/teacher/batchController");
const studentController = require("../controllers/teacher/studentController");
const attendanceController = require("../controllers/teacher/attendanceController");
const feeController = require("../controllers/teacher/feeController");
const testController = require("../controllers/teacher/testController");
const resourceController = require("../controllers/teacher/resourceController");
const reportsController = require("../controllers/teacher/reportsController");
const communicationController = require("../controllers/teacher/communicationController");
const auditController = require("../controllers/teacher/auditController");

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many login attempts, please try again after 15 minutes"
});

// Load context batches for all teacher routes (relies on req.viewingYear set in app.js)
router.use(loadBatches);

// Auth & Dashboard
router.get("/teacher/login", catchAsync(authController.renderLogin));
router.post("/teacher/login", loginLimiter, ensureDBConnection, catchAsync(authController.processLogin));
router.get("/teacher/dashboard", ensureDBConnection, requireTeacherLogin, catchAsync(authController.renderDashboard));
router.get("/teacher/logout", catchAsync(authController.processLogout));

// Teacher Management
router.get("/teacher/add_teacher", ensureDBConnection, requireTeacherLogin, catchAsync(authController.renderAddTeacher));
router.post("/teacher/add_teacher", ensureDBConnection, requireTeacherLogin, catchAsync(authController.processAddTeacher));
router.get("/teacher/edit_teacher/:id", ensureDBConnection, requireTeacherLogin, catchAsync(authController.renderEditTeacher));
router.post("/teacher/edit_teacher/:id", ensureDBConnection, requireTeacherLogin, catchAsync(authController.processEditTeacher));

// Batch Management
router.get("/teacher/manage_batches", ensureDBConnection, requireTeacherLogin, catchAsync(batchController.renderManageBatches));
router.get("/teacher/add_batch", (req, res) => res.redirect("/teacher/manage_batches"));
router.post("/teacher/add_batch", ensureDBConnection, requireTeacherLogin, catchAsync(batchController.processAddBatch));
router.get("/teacher/edit_batch/:id", (req, res) => res.redirect("/teacher/manage_batches"));
router.post("/teacher/edit_batch/:id", ensureDBConnection, requireTeacherLogin, catchAsync(batchController.processEditBatch));

// Student Management
router.get("/teacher/manage_students", ensureDBConnection, requireTeacherLogin, catchAsync(studentController.renderManageStudents));
router.get("/teacher/print_student_directory", ensureDBConnection, requireTeacherLogin, catchAsync(studentController.printStudentDirectory));
router.get("/teacher/add_student", ensureDBConnection, requireTeacherLogin, catchAsync(studentController.renderAddStudent));
router.post("/teacher/add_student", ensureDBConnection, requireTeacherLogin, upload.single("profilePhoto"), catchAsync(studentController.processAddStudent));
router.get("/teacher/edit_profile/:id", ensureDBConnection, requireTeacherLogin, catchAsync(studentController.renderEditProfile));
router.post("/teacher/edit_profile/:id", ensureDBConnection, requireTeacherLogin, upload.single("profilePhoto"), catchAsync(studentController.processEditProfile));
router.get("/teacher/view_profile/:id", ensureDBConnection, requireTeacherLogin, catchAsync(studentController.renderViewProfile));
router.get("/teacher/bulk_add_students", ensureDBConnection, requireTeacherLogin, catchAsync(studentController.renderBulkAddStudents));
router.post("/teacher/bulk_save_students", ensureDBConnection, requireTeacherLogin, express.json(), catchAsync(studentController.processBulkSaveStudents));
router.get("/teacher/bulk_student_reports", ensureDBConnection, requireTeacherLogin, catchAsync(studentController.generateBulkStudentReports));
router.get("/teacher/student_report/:id", ensureDBConnection, requireTeacherLogin, catchAsync(studentController.generateStudentReport));

// Attendance Management
router.get("/teacher/manage_attendance", ensureDBConnection, requireTeacherLogin, catchAsync(attendanceController.renderManageAttendance));
router.post("/teacher/manage_attendance", ensureDBConnection, requireTeacherLogin, catchAsync(attendanceController.processManageAttendance));
router.get("/teacher/detailed_attendance", ensureDBConnection, requireTeacherLogin, catchAsync(attendanceController.renderDetailedAttendance));
router.get("/teacher/defaulters/:year/:month", ensureDBConnection, requireTeacherLogin, catchAsync(attendanceController.renderDefaulters));
router.get("/teacher/defaulters/download/:year/:month", ensureDBConnection, requireTeacherLogin, catchAsync(attendanceController.downloadDefaulters));
router.get("/teacher/bulk_attendance", ensureDBConnection, requireTeacherLogin, catchAsync(attendanceController.renderBulkAttendance));
router.post("/teacher/bulk_save_attendance", ensureDBConnection, requireTeacherLogin, express.json(), catchAsync(attendanceController.processBulkSaveAttendance));


// Fee Management
router.get("/teacher/manage_fees", ensureDBConnection, requireTeacherLogin, catchAsync(feeController.renderManageFees));
router.post("/teacher/add_fees", ensureDBConnection, requireTeacherLogin, catchAsync(feeController.processAddFees));
router.get("/teacher/revenue_report", ensureDBConnection, requireTeacherLogin, catchAsync(feeController.renderRevenueReport));
router.get("/teacher/fee_defaulters", ensureDBConnection, requireTeacherLogin, catchAsync(feeController.renderFeeDefaulters));
router.get("/teacher/fee_defaulters/download", ensureDBConnection, requireTeacherLogin, catchAsync(feeController.downloadFeeDefaulters));
router.get("/teacher/bulk_fees", ensureDBConnection, requireTeacherLogin, catchAsync(feeController.renderBulkFees));
router.post("/teacher/bulk_save", ensureDBConnection, requireTeacherLogin, express.json(), catchAsync(feeController.processBulkSave));
router.get("/teacher/print_fee_sheet", ensureDBConnection, requireTeacherLogin, catchAsync(feeController.downloadFeeCollectionSheet));
router.get("/teacher/fee_summary/:id", ensureDBConnection, requireTeacherLogin, catchAsync(feeController.downloadFeeSummaryTeacher));

// Test Management & Scores & Timetable
router.get("/teacher/manage_tests", ensureDBConnection, requireTeacherLogin, catchAsync(testController.renderManageTests));
router.get("/teacher/generate_paper", ensureDBConnection, requireTeacherLogin, catchAsync(testController.renderGeneratePaper));
router.post("/teacher/add_test", ensureDBConnection, requireTeacherLogin, upload.single("questionPaperFile"), catchAsync(testController.processAddTest));
router.post("/teacher/delete_test/:id", ensureDBConnection, requireTeacherLogin, catchAsync(testController.processDeleteTest));
router.post("/teacher/edit_test/:id", ensureDBConnection, requireTeacherLogin, upload.single("questionPaperFile"), catchAsync(testController.processEditTest));
router.get("/teacher/manage_score", ensureDBConnection, requireTeacherLogin, catchAsync(testController.renderManageScore));

router.get("/api/tests/:batchId", ensureDBConnection, requireTeacherLogin, catchAsync(testController.apiGetTests));
router.get("/api/scores/:batchId/:testId", ensureDBConnection, requireTeacherLogin, catchAsync(testController.apiGetScores));
router.post("/api/scores/save", ensureDBConnection, requireTeacherLogin, catchAsync(testController.apiSaveScores));
router.post("/api/ai/generate_paper", ensureDBConnection, requireTeacherLogin, catchAsync(testController.generatePaperAI));
router.get("/api/scores/consolidated_classwise", ensureDBConnection, requireTeacherLogin, catchAsync(testController.apiConsolidatedScores));
router.get("/teacher/timetable", ensureDBConnection, requireTeacherLogin, catchAsync(testController.renderTimetable));
router.post("/teacher/timetable/bulk", ensureDBConnection, requireTeacherLogin, catchAsync(testController.processTimetableBulk));
router.post("/teacher/timetable/edit/:id", ensureDBConnection, requireTeacherLogin, catchAsync(testController.processTimetableEdit));
router.post("/teacher/timetable/delete/:id", ensureDBConnection, requireTeacherLogin, catchAsync(testController.processTimetableDelete));

// Resource Management (Study Materials)
router.get("/teacher/study_material", ensureDBConnection, requireTeacherLogin, catchAsync(resourceController.renderStudyMaterial));
router.post("/teacher/study_material", ensureDBConnection, requireTeacherLogin, upload.single("file"), catchAsync(resourceController.processStudyMaterialUpload));
// Static API routes MUST come before :id param routes
router.post("/api/materials/repost-single/:id", ensureDBConnection, requireTeacherLogin, catchAsync(resourceController.repostSingleMaterial));
router.post("/api/materials/repost-multiple", ensureDBConnection, requireTeacherLogin, catchAsync(resourceController.repostMultipleMaterials));
router.put("/api/materials/:id", ensureDBConnection, requireTeacherLogin, upload.single("file"), catchAsync(resourceController.processStudyMaterialUpdate));
router.delete("/api/materials/:id", ensureDBConnection, requireTeacherLogin, catchAsync(resourceController.processStudyMaterialDelete));

// Reports Hub
router.get("/teacher/reports", ensureDBConnection, requireTeacherLogin, catchAsync(reportsController.renderReports));
router.get("/teacher/reports/communications", ensureDBConnection, requireTeacherLogin, catchAsync(communicationController.renderCommunicationLogs));
router.get("/teacher/reports/audit", ensureDBConnection, requireTeacherLogin, catchAsync(auditController.renderAuditTrail));

module.exports = router;
