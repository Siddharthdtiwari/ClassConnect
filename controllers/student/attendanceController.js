const mongoose = require("mongoose");
const User = require("../../models/User");
const Attendance = require("../../models/Attendance");

exports.renderAttendance = async (req, res) => {
  try {
    const student = await User.findById(req.session.userId).populate('batch').lean();
    if (!student) return res.status(404).send("Student not found");

    const studentId = student.studentId;

    const attendanceDocs = await Attendance.find({ batch: student.batch._id }).lean();

    const attendanceData = { overall: {} };

    attendanceDocs.forEach((doc) => {
      const studentRecord = doc.records.find((r) => r.studentId === studentId);

      if (studentRecord) {
        let status;
        if (studentRecord.status === "P") status = "present";
        else if (studentRecord.status === "A") status = "absent";
        else if (studentRecord.status === "H") status = "holiday";

        const dateObj = new Date(doc.date);
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, "0");
        const day = String(dateObj.getDate()).padStart(2, "0");
        const formatted = `${year}-${month}-${day}`;

        attendanceData.overall[formatted] = status;
      }
    });
    res.render("student/attendance", { student, attendanceData });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching attendance");
  }
};
