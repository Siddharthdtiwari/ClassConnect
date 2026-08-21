const nodemailer = require("nodemailer");
require("dotenv").config();
const path = require("path");
const { buildReceiptPDFBuffer } = require("./pdfUtils");
const EmailLog = require("../models/EmailLog");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.CONTACT_EMAIL_USER,
    pass: process.env.CONTACT_EMAIL_PASS,
  },
});

const User = require("../models/User");
const { NA_STATUS } = require("./feeHelpers");

const sendEmail = async (to, subject, htmlContent, attachments = [], logOptions = {}) => {
  if (!to) return; // Skip if no email is provided
  
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
    await transporter.sendMail({
      from: `"Tuition Hub Education Centre" <${process.env.CONTACT_EMAIL_USER}>`,
      to,
      subject,
      html: htmlContent,
      attachments,
    });
    console.log(`Email sent successfully to ${to}`);
  } catch (error) {
    status = "Failed";
    errorMessage = error.message || String(error);
    console.error(`Failed to send email to ${to}:`, error);
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
    };
    if (studentRef && studentRef !== "") logData.studentRef = studentRef;
    if (academicYear && academicYear !== "") logData.academicYear = academicYear;

    await EmailLog.create(logData);
  } catch (logErr) {
    console.error("Failed to save email log:", logErr);
  }
};

const Fee = require("../models/Fee");

const sendFeeReceipt = async (studentEmail, studentName, month, year, amount, receiptData = null) => {
  let feeSummaryHtml = "";
  if (receiptData && receiptData.student) {
    try {
      const student = receiptData.student;
      const fees = await Fee.find({ studentId: student.studentId, batch: student.batch }).lean();

      const months = ["May", "June", "July", "August", "September", "October", "November", "December", "January", "February", "March", "April"];
      const calendarToAcademic = { 4: 0, 5: 1, 6: 2, 7: 3, 8: 4, 9: 5, 10: 6, 11: 7, 0: 8, 1: 9, 2: 10, 3: 11 };

      const now = new Date();
      const currentMonthIndex = now.getMonth();
      const currentAcademicIndex = calendarToAcademic[currentMonthIndex];
      const FEE_DUE_DAY = 10;
      const monthsElapsed = now.getDate() >= FEE_DUE_DAY ? currentAcademicIndex + 1 : currentAcademicIndex;

      let academicStartYear;
      if (student.batch && student.batch.academicYear) {
        academicStartYear = parseInt(student.batch.academicYear.split("-")[0]);
      } else {
        academicStartYear = currentMonthIndex >= 4 ? now.getFullYear() : now.getFullYear() - 1;
      }

      const yearForMonthIndex = (idx) => idx < 8 ? academicStartYear : academicStartYear + 1;

      // Same per-month status logic as the student fee dashboard (controllers/student/feeController.js)
      // so the email agrees with what the student sees when they log in — N/A months excluded,
      // elapsed-and-unpaid months are "Pending", future months are "Not Yet Due".
      const monthlyFee = Number(student.monthlyFee || 0);
      let totalDue = 0;
      const rows = [];

      for (let idx = 0; idx < months.length; idx++) {
        const m = months[idx];
        const feeYear = yearForMonthIndex(idx);
        const feeRecord = fees.find((f) => f.month === m && Number(f.year) === feeYear);

        if (feeRecord && feeRecord.status === NA_STATUS) {
          continue; // Not applicable to this student — leave out of the summary entirely.
        } else if (feeRecord && feeRecord.status === "Paid") {
          rows.push({ month: m, label: `Paid${feeRecord.datePaid ? ` on ${new Date(feeRecord.datePaid).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}`, color: "#16a34a", bg: "#f0fdf4" });
        } else if (idx < monthsElapsed) {
          rows.push({ month: m, label: "Pending", color: "#e11d48", bg: "#fff1f2" });
          totalDue += Number((feeRecord && feeRecord.amount) || monthlyFee);
        } else {
          rows.push({ month: m, label: "Not Yet Due", color: "#6b7280", bg: "#f9fafb" });
        }
      }

      const rowsHtml = rows.map((r) => `
          <tr>
            <td style="padding: 8px 0; color: #334155; font-size: 14px;">${r.month}</td>
            <td style="padding: 8px 0; text-align: right;"><span style="background: ${r.bg}; color: ${r.color}; font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 999px;">${r.label}</span></td>
          </tr>`).join("");

      feeSummaryHtml = `
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 18px 20px; margin: 24px 0;">
          <h3 style="margin-top: 0; color: #4b2d84; font-size: 16px; margin-bottom: 4px;">Fee Summary</h3>
          ${totalDue > 0
            ? `<p style="margin: 0 0 10px; color: #881337; font-size: 14px;">Total pending: <strong>₹${totalDue.toLocaleString("en-IN")}</strong></p>`
            : `<p style="margin: 0 0 10px; color: #166534; font-size: 14px;">All fees are cleared!</p>`}
          <table style="width: 100%; border-collapse: collapse;">${rowsHtml}</table>
        </div>`;
    } catch (e) {
      console.error("Error generating fee summary for email:", e);
    }
  }

  const subject = `Fee Receipt: ${month} ${year} - Tuition Hub Education Centre`;
  const htmlContent = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 680px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 18px; overflow: hidden; color: #334155; background: #ffffff;">
      <div style="background: linear-gradient(135deg, #4b2d84 0%, #6b46c1 100%); padding: 28px 30px; text-align: center;">
        <img src="cid:tuitionhublogo" alt="Tuition Hub Logo" style="height: 58px; margin-bottom: 14px; background: white; padding: 8px; border-radius: 14px; display: inline-block;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.4px;">Tuition Hub Education Centre</h1>
        <p style="margin: 10px 0 0; color: rgba(255,255,255,0.82); font-size: 12px; text-transform: uppercase; letter-spacing: 0.18em;">Payment receipt</p>
      </div>
      <div style="padding: 32px 30px;">
        <h2 style="color: #1e293b; margin-top: 0; font-size: 22px; font-weight: 700;">Dear ${studentName},</h2>
        <p style="font-size: 16px; line-height: 1.7; margin-bottom: 20px; color: #475569;">Thank you for your payment for <strong>${month} ${year}</strong>. Your receipt is attached to this email for your records.</p>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 18px 20px; margin: 24px 0;">
          <table style="width: 100%; border-collapse: collapse; font-size: 15px; color: #334155;">
            <tr>
              <td style="padding: 8px 0; width: 36%; color: #64748b;">Student</td>
              <td style="padding: 8px 0; font-weight: 700;">${studentName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b;">Period</td>
              <td style="padding: 8px 0; font-weight: 700;">${month} ${year}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b;">Amount Paid</td>
              <td style="padding: 8px 0; font-weight: 700; color: #16a34a;">₹${amount}</td>
            </tr>
          </table>
        </div>

        ${feeSummaryHtml}

        <p style="font-size: 15px; line-height: 1.7; margin-bottom: 24px; color: #475569;">If you have any questions, please reply to this email or contact the office during working hours.</p>

        <p style="font-size: 15px; line-height: 1.7; margin-bottom: 0; color: #334155;">Regards,<br><strong>Tuition Hub Education Centre Administration</strong></p>
      </div>
      <div style="background: #f8fafc; padding: 16px 30px; border-top: 1px solid #e2e8f0; text-align: center;">
        <p style="margin: 0; font-size: 12px; color: #94a3b8;">This is an automated message. Please keep the attached receipt for your records.</p>
      </div>
    </div>
  `;

  const attachments = [
    {
      filename: "logo.png",
      path: path.join(__dirname, "..", "public", "images", "logo.png"),
      cid: "tuitionhublogo",
    },
  ];

  if (receiptData) {
    try {
      const receiptPdf = await buildReceiptPDFBuffer(receiptData.fee, receiptData.student);
      attachments.push({
        filename: `receipt-${receiptData.fee._id || `${month}-${year}`}.pdf`,
        content: receiptPdf,
        contentType: "application/pdf",
      });
    } catch (error) {
      console.error("Failed to generate receipt PDF attachment:", error);
    }
  }

  let computedAcademicYear;
  const feeMonth = (receiptData && receiptData.fee && receiptData.fee.month) ? receiptData.fee.month : month;
  const feeYear = parseInt((receiptData && receiptData.fee && receiptData.fee.year) ? receiptData.fee.year : year);
  
  if (feeMonth && feeYear) {
    const earlyMonths = ["January", "February", "March", "April"];
    const startYear = earlyMonths.includes(feeMonth) ? feeYear - 1 : feeYear;
    computedAcademicYear = `${startYear}-${(startYear + 1).toString().slice(-2)}`;
  } else if (receiptData && receiptData.academicYear) {
    computedAcademicYear = receiptData.academicYear;
  }

  const logOptions = {
    emailType: "Fee Receipt",
    studentRef: receiptData && receiptData.student ? receiptData.student._id : undefined,
    academicYear: computedAcademicYear
  };
  await sendEmail(studentEmail, subject, htmlContent, attachments, logOptions);
};

const sendTestMarks = async (studentEmail, studentName, testName, subjectName, score, maxMarks, percentage, logMeta = {}) => {
  const emailSubject = `Test Results: ${testName} - Tuition Hub Education Centre`;
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #5d3a9b; padding: 20px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0;">Tuition Hub Education Centre</h1>
      </div>
      <div style="padding: 30px;">
        <h2 style="color: #5d3a9b; margin-top: 0;">Test Results Announced</h2>
        <p style="font-size: 16px;">Hello <strong>${studentName}</strong>,</p>
        <p style="font-size: 16px; line-height: 1.5;">The marks for your recent test have been uploaded to your dashboard.</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr style="background-color: #f3e8ff;">
            <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Test</td>
            <td style="padding: 10px; border: 1px solid #e0e0e0;">${testName}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Subject</td>
            <td style="padding: 10px; border: 1px solid #e0e0e0;">${subjectName}</td>
          </tr>
          <tr style="background-color: #f3e8ff;">
            <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Score</td>
            <td style="padding: 10px; border: 1px solid #e0e0e0;"><strong>${score === null ? 'Absent' : `${score} / ${maxMarks}`}</strong>${score === null ? '' : ` (${percentage}%)`}</td>
          </tr>
        </table>
        
        <p style="font-size: 16px;">Keep up the hard work! You can view detailed insights on your student dashboard.</p>
        <p style="font-size: 16px; color: #666; margin-bottom: 0;">Best regards,<br>Tuition Hub Education Centre Administration</p>
      </div>
    </div>
  `;
  const logOptions = {
    emailType: "Test Score",
    studentRef: logMeta.studentRef,
    academicYear: logMeta.academicYear
  };
  await sendEmail(studentEmail, emailSubject, htmlContent, [], logOptions);
};

const sendMonthEndAttendance = async (studentEmail, studentName, month, year, presentDays, absentDays, percentage, logMeta = {}) => {
  const emailSubject = `Monthly Attendance Report: ${month} ${year} - Tuition Hub Education Centre`;
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #5d3a9b; padding: 20px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0;">Tuition Hub Education Centre</h1>
      </div>
      <div style="padding: 30px;">
        <h2 style="color: #5d3a9b; margin-top: 0;">Monthly Attendance Report</h2>
        <p style="font-size: 16px;">Hello <strong>${studentName}</strong>,</p>
        <p style="font-size: 16px; line-height: 1.5;">Here is your attendance summary for the month of <strong>${month} ${year}</strong>:</p>
        
        <div style="display: flex; justify-content: space-between; margin: 25px 0;">
          <div style="text-align: center; flex: 1; padding: 15px; background-color: #e8f5e9; border-radius: 8px; margin-right: 10px;">
            <span style="display: block; font-size: 24px; font-weight: bold; color: #2e7d32;">${presentDays}</span>
            <span style="font-size: 14px; color: #666;">Present Days</span>
          </div>
          <div style="text-align: center; flex: 1; padding: 15px; background-color: #ffebee; border-radius: 8px; margin-right: 10px;">
            <span style="display: block; font-size: 24px; font-weight: bold; color: #c62828;">${absentDays}</span>
            <span style="font-size: 14px; color: #666;">Absent Days</span>
          </div>
          <div style="text-align: center; flex: 1; padding: 15px; background-color: #f3e8ff; border-radius: 8px;">
            <span style="display: block; font-size: 24px; font-weight: bold; color: #5d3a9b;">${percentage}%</span>
            <span style="font-size: 14px; color: #666;">Attendance</span>
          </div>
        </div>
        
        <p style="font-size: 16px; color: #666; margin-bottom: 0;">Best regards,<br>Tuition Hub Education Centre Administration</p>
      </div>
    </div>
  `;
  const logOptions = {
    emailType: "Attendance Report",
    studentRef: logMeta.studentRef,
    academicYear: logMeta.academicYear || year
  };
  await sendEmail(studentEmail, emailSubject, htmlContent, [], logOptions);
};

const sendContactConfirmation = async (toEmail, toName, message) => {
  const subject = `We've received your inquiry — Tuition Hub Education Centre`;
  const htmlContent = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; color: #334155;">
      <div style="background-color: #5d3a9b; padding: 35px 30px; text-align: center;">
        <img src="cid:tuitionhublogo" alt="Tuition Hub Logo" style="height: 55px; margin-bottom: 20px; background: white; padding: 8px; border-radius: 12px; display: inline-block;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600; letter-spacing: -0.5px;">Tuition Hub Education Centre</h1>
      </div>
      <div style="padding: 40px 30px;">
        <h2 style="color: #1e293b; margin-top: 0; font-size: 20px; font-weight: 600;">Dear ${toName},</h2>
        <p style="font-size: 16px; line-height: 1.6; margin-bottom: 24px;">Thank you for contacting Tuition Hub Education Centre. This email is to confirm that we have received your inquiry.</p>
        <p style="font-size: 16px; line-height: 1.6; margin-bottom: 24px;">Our administration team is currently reviewing your message and will respond within one business day.</p>
        
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 20px; margin-bottom: 24px;">
          <h3 style="margin: 0 0 12px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #64748b;">Contact Information</h3>
          <p style="margin: 0 0 8px 0; font-size: 15px;"><strong>Phone:</strong> +91 9967466955 / +91 8451826909</p>
          <p style="margin: 0; font-size: 15px;"><strong>Address:</strong> Navpada, Marol Naka, Andheri (E), Mumbai 400059</p>
        </div>

        <div style="border-left: 3px solid #cbd5e1; padding-left: 16px; margin-bottom: 30px;">
          <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #64748b;">Your Message:</p>
          <p style="margin: 0; font-size: 15px; font-style: italic; color: #475569; line-height: 1.6;">"${message.replace(/\n/g, '<br>')}"</p>
        </div>

        <p style="font-size: 16px; line-height: 1.6; margin-bottom: 0;">Sincerely,</p>
        <p style="font-size: 16px; font-weight: 600; margin-top: 4px;">Administration Team<br>Tuition Hub</p>
      </div>
      <div style="background-color: #f1f5f9; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
        <p style="font-size: 12px; color: #94a3b8; margin: 0;">This is an automated message. Please do not reply directly to this email.</p>
      </div>
    </div>
  `;
  const attachments = [{
    filename: 'logo.png',
    path: require('path').join(__dirname, '..', 'public', 'images', 'logo.png'),
    cid: 'tuitionhublogo'
  }];
  const logOptions = { emailType: "Contact Confirmation" };
  await sendEmail(toEmail, subject, htmlContent, attachments, logOptions);
};

const sendFeeReminder = async (studentEmail, studentName, month, balance, id, baseUrl, logMeta = {}) => {
  const subject = `Fee Reminder - Tuition Hub`;
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #5d3a9b; padding: 20px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0;">Tuition Hub Education Centre</h1>
      </div>
      <div style="padding: 30px;">
        <h2 style="color: #5d3a9b; margin-top: 0;">Fee Reminder</h2>
        <p style="font-size: 16px;">Hello <strong>${studentName}</strong>,</p>
        <p style="font-size: 16px; line-height: 1.5;">This is a gentle reminder that your fees for <strong>${month}</strong> are currently pending.</p>
        
        <div style="background-color: #f3e8ff; border-left: 4px solid #5d3a9b; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; font-size: 18px;">Total Due: <strong>₹${balance}</strong></p>
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
  sendFeeReceipt,
  sendTestMarks,
  sendMonthEndAttendance,
  sendContactConfirmation,
  sendFeeReminder
};
