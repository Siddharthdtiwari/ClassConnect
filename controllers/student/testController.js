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
    const studentBatchName = req.user.batch ? req.user.batch.name : 'Unknown';
    res.render("student/test_score", { scoresBySubject, studentBatchName });
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

exports.renderViewPaper = async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test || !test.htmlContent) {
      return res.status(404).send("Paper not found or it is a PDF.");
    }
    // Reuse teacher's view_paper since it has no teacher-specific layout
    res.render("teacher/view_paper", { test });
  } catch (err) {
    console.error("View paper error:", err);
    res.status(500).send("Error rendering paper");
  }
};
