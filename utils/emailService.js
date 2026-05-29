const nodemailer = require("nodemailer");
require("dotenv").config();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.CONTACT_EMAIL_USER,
    pass: process.env.CONTACT_EMAIL_PASS,
  },
});

const sendEmail = async (to, subject, htmlContent, attachments = []) => {
  if (!to) return; // Skip if no email is provided
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
    console.error(`Failed to send email to ${to}:`, error);
  }
};

const sendFeeReceipt = async (studentEmail, studentName, month, year, amount) => {
  const subject = `Fee Receipt: ${month} ${year} - Tuition Hub Education Centre`;
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #5d3a9b; padding: 20px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0;">Tuition Hub Education Centre</h1>
      </div>
      <div style="padding: 30px;">
        <h2 style="color: #5d3a9b; margin-top: 0;">Fee Payment Receipt</h2>
        <p style="font-size: 16px;">Hello <strong>${studentName}</strong>,</p>
        <p style="font-size: 16px; line-height: 1.5;">This is to confirm that we have successfully received your fee payment for the month of <strong>${month} ${year}</strong>.</p>
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 6px; margin: 20px 0;">
          <p style="margin: 5px 0; font-size: 16px;"><strong>Amount Paid:</strong> <span style="color: #27ae60;">₹${amount}</span></p>
        </div>
        <p style="font-size: 16px;">Thank you for your prompt payment.</p>
        <p style="font-size: 16px; color: #666; margin-bottom: 0;">Best regards,<br>Tuition Hub Education Centre Administration</p>
      </div>
    </div>
  `;
  await sendEmail(studentEmail, subject, htmlContent);
};

const sendTestMarks = async (studentEmail, studentName, testName, subjectName, score, maxMarks, percentage) => {
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
            <td style="padding: 10px; border: 1px solid #e0e0e0;"><strong>${score} / ${maxMarks}</strong> (${percentage}%)</td>
          </tr>
        </table>
        
        <p style="font-size: 16px;">Keep up the hard work! You can view detailed insights on your student dashboard.</p>
        <p style="font-size: 16px; color: #666; margin-bottom: 0;">Best regards,<br>Tuition Hub Education Centre Administration</p>
      </div>
    </div>
  `;
  await sendEmail(studentEmail, emailSubject, htmlContent);
};

const sendMonthEndAttendance = async (studentEmail, studentName, month, year, presentDays, absentDays, percentage) => {
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
  await sendEmail(studentEmail, emailSubject, htmlContent);
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
  await sendEmail(toEmail, subject, htmlContent, attachments);
};

module.exports = {
  sendFeeReceipt,
  sendTestMarks,
  sendMonthEndAttendance,
  sendContactConfirmation
};
