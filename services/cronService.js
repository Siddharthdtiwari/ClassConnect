const cron = require('node-cron');
const nodemailer = require('nodemailer');
const ExamTimetable = require('../models/ExamTimetable');
const Teacher = require('../models/Teacher');

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.CONTACT_EMAIL_USER,
    pass: process.env.CONTACT_EMAIL_PASS,
  },
});

function initCronJobs() {
  // Run daily at 12:00 AM
  cron.schedule('0 0 * * *', async () => {
    console.log("Running daily exam notification cron job...");
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const nextWeek = new Date(today);
      nextWeek.setDate(today.getDate() + 7);

      // Find exams between today and next week
      const upcomingExams = await ExamTimetable.find({
        examDate: {
          $gte: today,
          $lte: nextWeek
        }
      }).populate('batch').sort({ examDate: 1 }).lean();

      if (upcomingExams.length === 0) {
        console.log("No upcoming exams for next week.");
        return;
      }

      // Format exams list
      let emailText = "Hello Teachers,\n\nHere are the upcoming exams for the next 7 days:\n\n";
      upcomingExams.forEach(exam => {
        const dateStr = exam.examDate.toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
        const batchName = exam.batch ? exam.batch.name : 'Unknown Batch';
        emailText += `- [${dateStr}] ${batchName} - ${exam.subject} (${exam.examType})\n`;
        if (exam.chapters && exam.chapters !== "All") {
          emailText += `  Chapters: ${exam.chapters}\n`;
        }
      });
      emailText += "\nBest regards,\nClassConnect Tuition Hub";

      // Fetch all teachers/admins who should receive the email
      const teachers = await Teacher.find({ email: { $exists: true, $ne: "" } }).select('email').lean();
      
      const teacherEmails = teachers.map(t => t.email);
      // Also send to the contact email as a fallback/admin notification
      if (process.env.CONTACT_EMAIL_TO && !teacherEmails.includes(process.env.CONTACT_EMAIL_TO)) {
        teacherEmails.push(process.env.CONTACT_EMAIL_TO);
      }

      if (teacherEmails.length === 0) {
        console.log("No teacher emails found to send notifications.");
        return;
      }

      await transporter.sendMail({
        from: process.env.CONTACT_EMAIL_USER,
        to: teacherEmails.join(','),
        subject: "📅 Upcoming Exams for Next Week",
        text: emailText
      });

      console.log(`Exam notification email sent to ${teacherEmails.length} recipients.`);
    } catch (error) {
      console.error("Error in exam notification cron job:", error);
    }
  });
}

module.exports = { initCronJobs };
