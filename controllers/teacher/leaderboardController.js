const mongoose = require("mongoose");
const User = require("../../models/User");

exports.renderLeaderboard = async (req, res) => {
  try {
    let targetYear = req.viewingYear;
    let batches = await mongoose.model('Batch').find({ academicYear: targetYear }).select('_id name').lean();
    let viewingBatches = batches.map(b => b._id);
    let allStudents = await User.find({ batch: { $in: viewingBatches } }).lean();

    // If no students or no one has any points, fallback to previous year's leaderboard
    const hasPoints = allStudents.some(s => s.points > 0);
    if (!hasPoints) {
      const startYear = parseInt(targetYear.split('-')[0]);
      const fallbackYear = `${startYear - 1}-${String(startYear).slice(2)}`;
      const prevBatches = await mongoose.model('Batch').find({ academicYear: fallbackYear }).select('_id name').lean();
      const prevBatchesIds = prevBatches.map(b => b._id);
      const prevStudents = await User.find({ batch: { $in: prevBatchesIds } }).lean();
      
      if (prevStudents.length > 0) {
          allStudents = prevStudents;
          batches = prevBatches;
          viewingBatches = prevBatchesIds;
          targetYear = fallbackYear;
      }
    }
    
    // Sort students by points descending
    allStudents.forEach((s) => {
      if (typeof s.points !== "number") s.points = 0;
    });
    const sortedAllStudents = [...allStudents].sort((a, b) => b.points - a.points);

    // Helper to format leaderboard array
    const formatLeaderboard = (studentsList) => {
      return studentsList.map((s, index) => ({
        rank: index + 1,
        name: s.studentName || s.name,
        studentId: s.studentId,
        score: s.points !== undefined ? s.points : s.score,
        rawScore: s.rawScore,
        totalMarks: s.totalMarks,
        batch: s.batch ? s.batch.toString() : null,
        avatar: s.profilePhoto || s.avatar || (s.studentName || s.name).split(" ").map((n) => n[0]).join("").toUpperCase(),
        isActive: s.isActive !== false
      }));
    };

    const globalLeaderboard = formatLeaderboard(sortedAllStudents);
    
    // FETCH TEST LEADERBOARDS
    const Score = mongoose.model('Score');
    const Test = mongoose.model('Test');
    
    // Fetch all tests for the viewing batches
    const tests = await Test.find({ batch: { $in: viewingBatches } }).select('_id testName totalMarks batch').lean();
    const testLeaderboardsRaw = {};
    
    // Initialize test leaderboards with all students from the test's batch (defaulting to 0)
    tests.forEach(test => {
      if (!testLeaderboardsRaw[test.testName]) {
        testLeaderboardsRaw[test.testName] = [];
      }
      
      const batchStudents = allStudents.filter(s => s.batch && s.batch.toString() === test.batch.toString() && s.isActive !== false);
      batchStudents.forEach(studentDoc => {
        const exists = testLeaderboardsRaw[test.testName].find(s => s.studentId === studentDoc.studentId);
        if (!exists) {
          testLeaderboardsRaw[test.testName].push({
            name: studentDoc.studentName,
            studentId: studentDoc.studentId,
            score: 0,
            rawScore: 0,
            totalMarks: test.totalMarks || 100,
            batch: test.batch ? test.batch.toString() : null,
            avatar: studentDoc.profilePhoto || studentDoc.studentName.split(" ").map(n => n[0]).join("").toUpperCase(),
            isActive: studentDoc.isActive !== false
          });
        }
      });
    });

    // Overlay actual scores
    const allScores = await Score.find({ batch: { $in: viewingBatches }, score: { $ne: null } }).lean();
    allScores.forEach(score => {
      if (testLeaderboardsRaw[score.testName]) {
        const studentEntry = testLeaderboardsRaw[score.testName].find(s => s.studentId === score.studentId);
        if (studentEntry) {
          studentEntry.score = score.percentage;
          studentEntry.rawScore = score.score;
        }
      }
    });

    const testLeaderboards = {};
    const sortedTestNames = Object.keys(testLeaderboardsRaw).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    for (const testName of sortedTestNames) {
      const students = testLeaderboardsRaw[testName];
      students.sort((a, b) => b.score - a.score);
      testLeaderboards[testName] = formatLeaderboard(students);
    }
    
    res.render("teacher/leader_board", { 
      globalLeaderboard,
      testLeaderboards,
      batches,
      currentUser: req.user,
      viewingYear: targetYear
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching leaderboard");
  }
};
