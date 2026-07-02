const express = require('express');
const router = express.Router();
const studentController = require('../controllers/teacher/studentController');
const testController = require('../controllers/teacher/testController');
const feeController = require('../controllers/student/feeController');
const { ensureDBConnection } = require('../middlewares/auth');

router.get('/public/report/:id/:signature', ensureDBConnection, studentController.generatePublicStudentReport);
router.get('/public/test/:id/:signature', ensureDBConnection, testController.viewPublicPaper);
router.get('/public/fee/:id/:signature', ensureDBConnection, feeController.viewPublicReceipt);

module.exports = router;
