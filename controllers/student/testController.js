const mongoose = require("mongoose");
const Test = require("../../models/Test");
const Score = require("../../models/Score");

exports.renderTestScore = async (req, res) => {
  try {
    const studentId = req.user.studentId;

    const scores = await Score.find({ studentId, batch: req.user.batch._id }).populate("testId").lean();

    const scoresBySubject = {};
    scores.forEach((score) => {
      const subject = score.testId?.subject || "Unknown";
      if (!scoresBySubject[subject]) scoresBySubject[subject] = [];
      scoresBySubject[subject].push({
        testName: score.testName,
        topic: score.testId?.topic || "No topic",
        score: score.score,
        percentage: score.percentage,
        subject: score.testId?.subject,
        total: score.testId?.totalMarks || 100,
        questionPaper: score.testId?.questionPaper || "",
      });
    });
    res.render("student/test_score", { scoresBySubject });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching scores");
  }
};

exports.renderTakeTest = async (req, res) => {
  try {
    const studentBatchId = req.user.batch ? req.user.batch._id : null;
    const studentBatchName = req.user.batch ? req.user.batch.name : 'Unknown';
    const subject = req.query.subject || "overall";
    
    let query = { batch: studentBatchId };
    if (subject !== "overall") {
      query.subject = subject;
    }
    const tests = await Test.find(query).lean();
    res.render("student/take_test", { tests, studentStandard: studentBatchName, subject });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading tests");
  }
};
