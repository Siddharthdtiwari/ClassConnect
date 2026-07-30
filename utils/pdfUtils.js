const { renderReceiptPDF, generateReceiptPDF, buildReceiptPDFBuffer } = require('./pdf/receiptGenerator');
const { drawStudentReport, generateStudentReportPDF } = require('./pdf/reportCardGenerator');
const { drawFeeDefaultersReport, drawAttendanceDefaultersReport, generateAttendanceDefaultersPDF, generateFeeDefaultersPDF } = require('./pdf/defaultersGenerator');
const { drawStudentDirectoryReport, generateStudentDirectoryPDF, drawFeeCollectionSheet, generateFeeCollectionSheetPDF } = require('./pdf/directoryGenerator');
const { drawFeeSummaryReport, generateFeeSummaryPDF } = require('./pdf/feeSummaryGenerator');

module.exports = { generateReceiptPDF, buildReceiptPDFBuffer, drawStudentReport, generateStudentReportPDF, generateFeeDefaultersPDF, generateAttendanceDefaultersPDF, generateStudentDirectoryPDF, generateFeeCollectionSheetPDF, generateFeeSummaryPDF };
