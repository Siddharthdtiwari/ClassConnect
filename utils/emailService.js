const nodemailer = require("nodemailer");
require("dotenv").config();
const path = require("path");
const { buildReceiptPDFBuffer } = require("./pdfUtils");
const EmailLog = require("../models/EmailLog");
const User = require("../models/User");
const { NA_STATUS } = require("./feeHelpers");

const LOGO_URL = "https://res.cloudinary.com/dvegngui0/image/upload/v1788105540/branding/itner0bzhrekcbz7tqsj.png";

// Pooled Gmail SMTP Transporter (Sends 100% from tuitionhubeducationcentre@gmail.com)
const transporter = nodemailer.createTransport({
  service: "gmail",
  pool: true,
  maxConnections: 1,
  maxMessages: 50,
  rateDelta: 1000,
  rateLimit: 1,
  auth: {
    user: process.env.CONTACT_EMAIL_USER || "tuitionhubeducationcentre@gmail.com",
    pass: process.env.CONTACT_EMAIL_PASS,
  },
});

const getTransporter = () => transporter;

const getFromAddress = () => {
  return `"Tuition Hub Education Centre" <${process.env.CONTACT_EMAIL_USER || "tuitionhubeducationcentre@gmail.com"}>`;
};

// Email validation helper
const isValidEmail = (email) => {
  if (!email || typeof email !== "string") return false;
  const trimmed = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) return false;
  if (trimmed.includes("dummy") || trimmed.includes("test@") || trimmed.endsWith("@example.com")) return false;
  return true;
};

const sendEmail = async (to, subject, htmlContent, attachments = [], logOptions = {}) => {
  if (!to || !isValidEmail(to)) {
    console.log(`Email skipped: Invalid or dummy email address '${to}'`);
    return;
  }
  
  try {
    let student = null;
    if (logOptions.studentRef) {
      student = await User.findById(logOptions.studentRef).select("isActive").lean();
    } else {
      student = await User.findOne({ email: to }).select("isActive").lean();
    }
    
    if (student && student.isActive === false) {
      console.log(`Email skipped for ${to} because student is inactive.`);
      return;
    }
  } catch (err) {
    console.error("Error checking student active status before email:", err);
  }

  let status = "Sent";
  let errorMessage = "";
  try {
    const fromAddr = getFromAddress();
    await transporter.sendMail({
      from: fromAddr,
      to: to.trim(),
      subject,
      html: htmlContent,
      attachments,
    });
    console.log(`Email sent via Gmail SMTP to ${to}`);
  } catch (error) {
    status = "Failed";
    errorMessage = error.message || String(error);
    console.error(`Failed to send email to ${to}:`, errorMessage);
  }

  // Save to EmailLog
  try {
    const { emailType = "General", studentRef, academicYear } = logOptions;
    const logData = {
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      emailType,
      status,
      errorMessage,
      sentAt: new Date(),
    };

    if (studentRef) logData.studentRef = studentRef;
    if (academicYear) logData.academicYear = academicYear;

    await EmailLog.create(logData);
  } catch (logError) {
    console.error("Failed to log email to DB:", logError);
  }
};

const sendFeeReceipt = async (studentEmail, studentName, month, year, amount, logMeta = {}) => {
  const subject = `Fee Receipt: ${month} ${year} - Tuition Hub`;
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #5d3a9b 0%, #3c2368 100%); padding: 25px 30px; text-align: center;">
        <img src="${LOGO_URL}" alt="Tuition Hub Logo" style="height: 55px; max-width: 180px; object-fit: contain; background: #ffffff; padding: 6px 14px; border-radius: 10px; margin-bottom: 12px; display: inline-block;" />
        <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700;">Tuition Hub Education Centre</h1>
      </div>
      <div style="padding: 30px;">
        <h2 style="color: #5d3a9b; margin-top: 0;">Fee Payment Received</h2>
        <p style="font-size: 16px;">Hello <strong>${studentName}</strong>,</p>
        <p style="font-size: 16px; line-height: 1.5;">Thank you for your payment. We have successfully recorded your fee payment for <strong>${month} ${year}</strong>.</p>
        
        <div style="background-color: #f3e8ff; border-left: 4px solid #5d3a9b; padding: 15px; margin: 20px 0; border-radius: 6px;">
          <p style="margin: 0; font-size: 18px;">Amount Paid: <strong>?${amount}</strong></p>
        </div>
        
        <p style="font-size: 16px;">Please find your official PDF receipt attached to this email.</p>
        <p style="font-size: 16px; color: #666; margin-bottom: 0;">Best regards,<br>Tuition Hub Education Centre Administration</p>
      </div>
    </div>
  `;

  try {
    let pdfBuffer = null;
    let student = await User.findOne({ email: studentEmail }).populate('batch').lean();
    if (student) {
      const fee = {
        month,
        year,
        amount,
        receiptNo: `TH-${Date.now().toString().slice(-6)}`,
        datePaid: new Date(),
        method: "Cash"
      };
      pdfBuffer = await buildReceiptPDFBuffer(fee, student);
    }

    const attachments = pdfBuffer ? [{
      filename: `Receipt_${studentName.replace(/\s+/g, '_')}_${month}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf'
    }] : [];

    const logOptions = {
      emailType: "Fee Receipt",
      studentRef: logMeta.studentRef,
      academicYear: logMeta.academicYear
    };

    await sendEmail(studentEmail, subject, htmlContent, attachments, logOptions);
  } catch (err) {
    console.error("Error generating attachment for fee receipt:", err);
    await sendEmail(studentEmail, subject, htmlContent, [], logMeta);
  }
};

const sendTestMarks = async (studentEmail, studentName, testName, subjectName, marks, totalMarks, percentage, logMeta = {}) => {
  const isAbsent = marks === null || marks === undefined;
  const scoreDisplay = isAbsent ? "Absent" : `${marks} / ${totalMarks}`;
  const percentDisplay = isAbsent ? "N/A" : `${percentage}%`;

  const subject = `Test Results: ${testName} - Tuition Hub Education Centre`;
  const htmlContent = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
      <div style="background: linear-gradient(135deg, #5d3a9b 0%, #3c2368 100%); padding: 25px 30px; text-align: center;">
        <img src="${LOGO_URL}" alt="Tuition Hub Logo" style="height: 55px; max-width: 180px; object-fit: contain; background: #ffffff; padding: 6px 14px; border-radius: 10px; margin-bottom: 12px; display: inline-block;" />
        <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700;">Tuition Hub Education Centre</h1>
        <p style="color: #e9d5ff; margin: 4px 0 0 0; font-size: 13px;">Academic Performance Update</p>
      </div>

      <div style="padding: 30px; color: #1e293b;">
        <p style="font-size: 16px; margin-top: 0;">Dear <strong>${studentName}</strong>,</p>
        <p style="font-size: 15px; color: #475569; line-height: 1.5;">Your results for the recent assessment <strong>${testName}</strong> have been evaluated and recorded.</p>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 25px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Subject:</td>
              <td style="padding: 8px 0; font-weight: 600; text-align: right; color: #0f172a; font-size: 14px;">${subjectName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Assessment:</td>
              <td style="padding: 8px 0; font-weight: 600; text-align: right; color: #0f172a; font-size: 14px;">${testName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 14px; border-top: 1px solid #e2e8f0;">Score Obtained:</td>
              <td style="padding: 8px 0; font-weight: 700; text-align: right; color: ${isAbsent ? '#ef4444' : '#5d3a9b'}; font-size: 16px; border-top: 1px solid #e2e8f0;">${scoreDisplay}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Percentage:</td>
              <td style="padding: 8px 0; font-weight: 700; text-align: right; color: ${isAbsent ? '#ef4444' : '#5d3a9b'}; font-size: 16px;">${percentDisplay}</td>
            </tr>
          </table>
        </div>

        <p style="font-size: 14px; color: #64748b; line-height: 1.5;">Keep up the dedicated effort in your studies. For any queries regarding your score, please reach out to your subject teacher.</p>
        
        <p style="font-size: 15px; color: #334155; margin-bottom: 0; margin-top: 30px;">Best regards,<br><strong>Academic Evaluation Team</strong><br>Tuition Hub</p>
      </div>

      <div style="background-color: #f1f5f9; padding: 15px; text-align: center; border-top: 1px solid #e2e8f0;">
        <p style="font-size: 12px; color: #94a3b8; margin: 0;">This is an automated performance report. Please do not reply directly.</p>
      </div>
    </div>
  `;

  const logOptions = {
    emailType: "Test Marks",
    studentRef: logMeta.studentRef,
    academicYear: logMeta.academicYear
  };

  await sendEmail(studentEmail, subject, htmlContent, [], logOptions);
};

const sendMonthEndAttendance = async (studentEmail, studentName, monthName, year, presentDays, absentDays, percentage, logMeta = {}) => {
  const totalDays = presentDays + absentDays;
  const subject = `Monthly Attendance Report: ${monthName} ${year} - Tuition Hub Education Centre`;
  
  let statusColor = "#10b981"; // Green
  let statusText = "Excellent Attendance";
  if (percentage < 75) {
    statusColor = "#ef4444"; // Red
    statusText = "Needs Improvement (Below 75%)";
  } else if (percentage < 85) {
    statusColor = "#f59e0b"; // Yellow
    statusText = "Satisfactory Attendance";
  }

  const htmlContent = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
      <div style="background: linear-gradient(135deg, #5d3a9b 0%, #3c2368 100%); padding: 25px 30px; text-align: center;">
        <img src="${LOGO_URL}" alt="Tuition Hub Logo" style="height: 55px; max-width: 180px; object-fit: contain; background: #ffffff; padding: 6px 14px; border-radius: 10px; margin-bottom: 12px; display: inline-block;" />
        <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700;">Tuition Hub Education Centre</h1>
        <p style="color: #e9d5ff; margin: 4px 0 0 0; font-size: 13px;">Monthly Attendance Statement</p>
      </div>

      <div style="padding: 30px; color: #1e293b;">
        <p style="font-size: 16px; margin-top: 0;">Dear Parent / Student <strong>${studentName}</strong>,</p>
        <p style="font-size: 15px; color: #475569; line-height: 1.5;">Here is the monthly attendance summary for <strong>${monthName} ${year}</strong>.</p>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 25px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Total Working Days Recorded:</td>
              <td style="padding: 8px 0; font-weight: 600; text-align: right; color: #0f172a; font-size: 14px;">${totalDays} Days</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Present Days:</td>
              <td style="padding: 8px 0; font-weight: 600; text-align: right; color: #10b981; font-size: 14px;">${presentDays} Days</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Absent Days:</td>
              <td style="padding: 8px 0; font-weight: 600; text-align: right; color: #ef4444; font-size: 14px;">${absentDays} Days</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 14px; border-top: 1px solid #e2e8f0;">Attendance Percentage:</td>
              <td style="padding: 8px 0; font-weight: 700; text-align: right; color: ${statusColor}; font-size: 18px; border-top: 1px solid #e2e8f0;">${percentage}%</td>
            </tr>
          </table>
          
          <div style="margin-top: 15px; padding: 10px; background-color: #ffffff; border-radius: 6px; border: 1px solid #e2e8f0; text-align: center;">
            <span style="font-size: 13px; font-weight: 700; color: ${statusColor};">${statusText}</span>
          </div>
        </div>

        <p style="font-size: 14px; color: #64748b; line-height: 1.5;">Regular attendance is vital for consistent academic progress. Please ensure prompt attendance in all scheduled classes.</p>
        
        <p style="font-size: 15px; color: #334155; margin-bottom: 0; margin-top: 30px;">Best regards,<br><strong>Administration Team</strong><br>Tuition Hub</p>
      </div>

      <div style="background-color: #f1f5f9; padding: 15px; text-align: center; border-top: 1px solid #e2e8f0;">
        <p style="font-size: 12px; color: #94a3b8; margin: 0;">This is an automated attendance statement. Please do not reply directly.</p>
      </div>
    </div>
  `;

  const logOptions = {
    emailType: "Attendance Report",
    studentRef: logMeta.studentRef,
    academicYear: logMeta.academicYear
  };

  await sendEmail(studentEmail, subject, htmlContent, [], logOptions);
};

const sendContactConfirmation = async (toEmail, senderName, senderSubject) => {
  const subject = `Message Received - Tuition Hub Education Centre`;
  const htmlContent = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
      <div style="background: linear-gradient(135deg, #5d3a9b 0%, #3c2368 100%); padding: 25px 30px; text-align: center;">
        <img src="${LOGO_URL}" alt="Tuition Hub Logo" style="height: 55px; max-width: 180px; object-fit: contain; background: #ffffff; padding: 6px 14px; border-radius: 10px; margin-bottom: 12px; display: inline-block;" />
        <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700;">Tuition Hub Education Centre</h1>
      </div>
      <div style="padding: 30px; color: #1e293b;">
        <p style="font-size: 16px; margin-top: 0;">Dear <strong>${senderName}</strong>,</p>
        <p style="font-size: 15px; color: #475569; line-height: 1.5;">Thank you for contacting Tuition Hub Education Centre. We have received your inquiry regarding <strong>"${senderSubject}"</strong> and our administration team will respond to you shortly.</p>
        <p style="font-size: 15px; color: #334155; margin-bottom: 0; margin-top: 30px;">Sincerely,<br><strong>Administration Team</strong><br>Tuition Hub</p>
      </div>
    </div>
  `;
  const logOptions = { emailType: "Contact Confirmation" };
  await sendEmail(toEmail, subject, htmlContent, [], logOptions);
};

const sendFeeReminder = async (studentEmail, studentName, month, balance, id, baseUrl, logMeta = {}) => {
  const subject = `Fee Reminder - Tuition Hub`;
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #5d3a9b 0%, #3c2368 100%); padding: 25px 30px; text-align: center;">
        <img src="${LOGO_URL}" alt="Tuition Hub Logo" style="height: 55px; max-width: 180px; object-fit: contain; background: #ffffff; padding: 6px 14px; border-radius: 10px; margin-bottom: 12px; display: inline-block;" />
        <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700;">Tuition Hub Education Centre</h1>
      </div>
      <div style="padding: 30px;">
        <h2 style="color: #5d3a9b; margin-top: 0;">Fee Reminder</h2>
        <p style="font-size: 16px;">Hello <strong>${studentName}</strong>,</p>
        <p style="font-size: 16px; line-height: 1.5;">This is a gentle reminder that your fees for <strong>${month}</strong> are currently pending.</p>
        
        <div style="background-color: #f3e8ff; border-left: 4px solid #5d3a9b; padding: 15px; margin: 20px 0; border-radius: 6px;">
          <p style="margin: 0; font-size: 18px;">Total Due: <strong>?${balance}</strong></p>
        </div>
        
        <p style="font-size: 16px;">You can view your detailed fee summary by clicking the link below:</p>
        <div style="margin: 25px 0;">
          <a href="${baseUrl}/public/fee-summary/${id}" style="background-color: #5d3a9b; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px; display: inline-block;">View Fee Summary</a>
        </div>
        
        <p style="font-size: 16px;">Please arrange for payment at your earliest convenience.</p>
        <p style="font-size: 16px; color: #666; margin-bottom: 0;">Best regards,<br>Tuition Hub Education Centre Administration</p>
      </div>
    </div>
  `;
  const logOptions = {
    emailType: "Fee Reminder",
    studentRef: logMeta.studentRef,
    academicYear: logMeta.academicYear
  };
  await sendEmail(studentEmail, subject, htmlContent, [], logOptions);
};

module.exports = {
  isValidEmail,
  getTransporter,
  getFromAddress,
  sendFeeReceipt,
  sendTestMarks,
  sendMonthEndAttendance,
  sendContactConfirmation,
  sendFeeReminder
};
