const mongoose = require("mongoose");
const User = require("../../models/User");

exports.renderLeaderboard = async (req, res) => {
  try {
    const currentStudent = await User.findById(req.session.userId).lean();
    if (!currentStudent) return res.redirect('/student/login');

    const currentUser = currentStudent.studentName;
    const studentBatchId = currentStudent.batch;

    // Optimize: fetch viewing batches
    let targetYear = req.viewingYear;
    let batches = await mongoose.model('Batch').find({ academicYear: targetYear }).select('_id').lean();
    let viewingBatches = batches.map(b => b._id);
    let allStudents = await User.find({ batch: { $in: viewingBatches } }).lean();

    // If no students or no one has any points, fallback to previous year's leaderboard
    const hasPoints = allStudents.some(s => s.points > 0);
    if (!hasPoints) {
      const startYear = parseInt(targetYear.split('-')[0]);
      const fallbackYear = `${startYear - 1}-${String(startYear).slice(2)}`;
      const prevBatches = await mongoose.model('Batch').find({ academicYear: fallbackYear }).select('_id').lean();
      const prevBatchesIds = prevBatches.map(b => b._id);
      const prevStudents = await User.find({ batch: { $in: prevBatchesIds } }).lean();
      
      if (prevStudents.length > 0) {
          allStudents = prevStudents;
          targetYear = fallbackYear;
      }
    }
    
    // Sort students by points descending
    allStudents.forEach((s) => {
      if (typeof s.points !== "number") s.points = 0;
    });
    allStudents.sort((a, b) => b.points - a.points);

    // Helper to format leaderboard array
    const formatLeaderboard = (studentsList) => {
      return studentsList.map((s, index) => ({
        rank: index + 1,
        name: s.studentName,
        studentId: s.studentId,
        score: s.points,
        avatar: s.profilePhoto || s.studentName.split(" ").map((n) => n[0]).join("").toUpperCase(),
      }));
    };

    const globalLeaderboard = formatLeaderboard(allStudents);
    const batchStudents = allStudents.filter(s => s.batch && s.batch.toString() === studentBatchId.toString());
    const batchLeaderboard = formatLeaderboard(batchStudents);

    res.render("student/leader_board", { 
      globalLeaderboard,
      batchLeaderboard,
      currentUser,
      viewingYear: targetYear
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching leaderboard");
  }
};
