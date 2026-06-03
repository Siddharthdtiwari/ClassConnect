const Batch = require("../../models/Batch");
const Test = require("../../models/Test");
const Score = require("../../models/Score");
const User = require("../../models/User");
const ExamTimetable = require("../../models/ExamTimetable");
const mongoose = require("mongoose");
const { sortStudentsByBatchAndId, sortBatches } = require("../../utils/sortHelpers");

exports.renderManageTests = async (req, res) => {
  try {
    const batches = await Batch.find({ academicYear: req.viewingYear });
    batches.sort(sortBatches);
    const batchIds = batches.map(b => b._id);
    const tests = await Test.find({ batch: { $in: batchIds } }).populate('batch').sort({ testDate: -1 });

    const byClass = {};
    batches.forEach(b => { byClass[b.name] = []; });
    tests.forEach(test => {
      const bName = test.batch ? test.batch.name : 'Unknown';
      if (!byClass[bName]) byClass[bName] = [];
      byClass[bName].push(test);
    });

    res.render("teacher/manage_tests", { tests, byClass });
  } catch (err) {
    console.error("Manage tests error:", err);
    res.status(500).send("Error");
  }
};

exports.renderAddTest = async (req, res) => {
  try {
    const batches = await Batch.find({ academicYear: req.viewingYear, isActive: true });
    batches.sort(sortBatches);
    res.render("teacher/add_test", { batches });
  } catch (err) {
    console.error("Add test error:", err);
    res.status(500).send("Error");
  }
};

exports.processDeleteTest = async (req, res) => {
  try {
    await Test.findByIdAndDelete(req.params.id);
    await Score.deleteMany({ testId: req.params.id });
    res.redirect("/teacher/manage_tests");
  } catch (err) {
    console.error("Delete test error:", err);
    res.status(500).send("Error");
  }
};

exports.renderManageScore = async (req, res) => {
  try {
    const batches = await Batch.find({ academicYear: req.viewingYear });
    batches.sort(sortBatches);
    res.render("teacher/manage_score", { batches });
  } catch (err) {
    console.error("Manage score error:", err);
    res.status(500).send("Error");
  }
};

exports.apiGetTests = async (req, res) => {
  try {
    const tests = await Test.find({ batch: req.params.batchId }).sort({ testDate: -1 });
    res.json(tests);
  } catch (err) {
    console.error("GET /api/tests/:batchId error:", err);
    res.status(500).json({ error: "Failed to fetch tests" });
  }
};

exports.apiGetScores = async (req, res) => {
  try {
    const { batchId, testId } = req.params;
    const students = await User.find({ batch: batchId }).populate('batch').lean();
    students.sort(sortStudentsByBatchAndId);
    const existingScores = await Score.find({ testId, batch: batchId });

    const scoreMap = {};
    existingScores.forEach(s => {
      scoreMap[s.studentId] = s.score;
    });

    const responseData = students.map(student => ({
      studentId: student.studentId,
      studentName: student.studentName,
      score: scoreMap[student.studentId] !== undefined ? scoreMap[student.studentId] : null
    }));

    res.json(responseData);
  } catch (err) {
    console.error("GET /api/scores error:", err);
    res.status(500).json({ error: "Failed to fetch student scores" });
  }
};

exports.apiSaveScores = async (req, res) => {
  try {
    const { testId, scores } = req.body;
    if (!testId || !scores || !Array.isArray(scores)) {
      return res.status(400).json({ error: "Invalid data" });
    }

    const test = await Test.findById(testId);
    if (!test) {
      return res.status(404).json({ error: "Test not found" });
    }

    const operations = [];
    for (const s of scores) {
      const student = await User.findOne({ studentId: s.studentId });
      if (!student) continue;

      const percentage = test.totalMarks > 0 ? Math.round((s.score / test.totalMarks) * 10000) / 100 : 0;

      operations.push({
        updateOne: {
          filter: { studentId: s.studentId, testId: test._id },
          update: {
            $set: {
              studentName: student.studentName,
              batch: test.batch,
              testName: test.testName,
              score: s.score,
              percentage: percentage
            }
          },
          upsert: true
        }
      });
    }

    if (operations.length > 0) {
      await Score.bulkWrite(operations);
    }

    res.json({ success: true, message: "Scores saved successfully!" });
  } catch (err) {
    console.error("POST /api/scores/save error:", err);
    res.status(500).json({ error: "Failed to save scores" });
  }
};

exports.apiConsolidatedScores = async (req, res) => {
  try {
    const batches = await Batch.find({ academicYear: req.viewingYear });
    batches.sort(sortBatches);
    const responseData = {};

    for (const batch of batches) {
      const tests = await Test.find({ batch: batch._id }).sort({ testDate: 1 });
      const students = await User.find({ batch: batch._id }).populate('batch').lean();
      students.sort(sortStudentsByBatchAndId);

      if (tests.length === 0 || students.length === 0) continue;

      const studentScoresData = [];
      const testIds = tests.map(t => t._id);
      const scores = await Score.find({ batch: batch._id, testId: { $in: testIds } });

      const scoreMap = {};
      scores.forEach(s => {
        if (!scoreMap[s.studentId]) scoreMap[s.studentId] = {};
        scoreMap[s.studentId][s.testId.toString()] = s.percentage;
      });

      students.forEach(student => {
        const sScores = {};
        tests.forEach(t => {
          const key = t._id.toString();
          if (scoreMap[student.studentId] && scoreMap[student.studentId][key] !== undefined) {
            sScores[key] = scoreMap[student.studentId][key];
          }
        });

        studentScoresData.push({
          studentId: student.studentId,
          studentName: student.studentName,
          scores: sScores
        });
      });

      responseData[batch.name] = {
        tests: tests.map(t => ({ _id: t._id, testName: t.testName, subject: t.subject, topic: t.topic })),
        students: studentScoresData
      };
    }

    res.json(responseData);
  } catch (err) {
    console.error("GET consolidated error:", err);
    res.status(500).json({ error: "Failed to fetch consolidated scores" });
  }
};

exports.renderTimetable = async (req, res) => {
  try {
    const batches = await Batch.find({ academicYear: req.viewingYear });
    batches.sort(sortBatches);
    const batchIds = batches.map(b => b._id);
    
    let filterBatchIds = batchIds;
    const selectedBatch = req.query.batchId || "";
    if (selectedBatch) {
      filterBatchIds = [selectedBatch];
    }

    const exams = await ExamTimetable.find({ batch: { $in: batchIds } })
      .populate('batch')
      .sort({ examDate: 1 });

    const groupedEntriesByStandard = {};
    exams.forEach(entry => {
      const bName = entry.batch ? entry.batch.name : 'Unknown';
      if (!groupedEntriesByStandard[bName]) {
        groupedEntriesByStandard[bName] = [];
      }
      
      const existing = groupedEntriesByStandard[bName].find(g => 
        g.subject === entry.subject &&
        g.examType === entry.examType &&
        new Date(g.examDate).getTime() === new Date(entry.examDate).getTime() &&
        g.chapters === entry.chapters
      );
      
      if (existing) {
        existing.ids.push(entry._id.toString());
        if (entry.addedBy === 'student') {
          existing.studentNames.push(entry.addedByName);
        }
      } else {
        groupedEntriesByStandard[bName].push({
          ids: [entry._id.toString()],
          examType: entry.examType,
          subject: entry.subject,
          examDate: entry.examDate,
          chapters: entry.chapters,
          isTeacherAdded: entry.addedBy === 'teacher',
          studentNames: entry.addedBy === 'student' ? [entry.addedByName] : [],
          batchId: entry.batch ? entry.batch._id.toString() : ''
        });
      }
    });

    res.render("teacher/timetable", {
      batches,
      selectedBatch,
      groupedEntriesByStandard,
      success: req.session.success || null,
      error: req.session.error || null
    });
    req.session.success = null;
    req.session.error = null;
  } catch (err) {
    console.error("Timetable GET error:", err);
    res.status(500).send("Error loading timetable");
  }
};

exports.processTimetableBulk = async (req, res) => {
  try {
    const { standard, examType, subjects, dates, chapters } = req.body;
    const batchId = standard;
    
    if (!batchId || !examType || !subjects || !dates || !chapters) {
      req.session.error = "Missing required fields.";
      return res.redirect("/teacher/timetable");
    }

    const batch = await Batch.findById(batchId);
    if (!batch) {
      req.session.error = "Selected batch not found.";
      return res.redirect("/teacher/timetable");
    }

    const operations = [];
    for (let i = 0; i < subjects.length; i++) {
      if (!subjects[i] || !dates[i]) continue;
      operations.push({
        batch: batch._id,
        examType,
        subject: subjects[i],
        examDate: new Date(dates[i]),
        chapters: chapters[i] || "All",
        addedBy: "teacher",
        addedById: req.session.userId || "teacher",
        addedByName: "Teacher"
      });
    }

    if (operations.length > 0) {
      await ExamTimetable.insertMany(operations);
      req.session.success = `Successfully scheduled ${operations.length} exams for ${batch.name}!`;
    } else {
      req.session.error = "No valid exam rows to add.";
    }
    res.redirect("/teacher/timetable");
  } catch (err) {
    console.error("Timetable bulk add error:", err);
    req.session.error = "Failed to schedule exams.";
    res.redirect("/teacher/timetable");
  }
};

exports.processTimetableEdit = async (req, res) => {
  try {
    const examIds = req.params.id.split(",");
    const { examType, subject, examDate, chapters, standard } = req.body;
    
    let targetBatchId = null;
    if (mongoose.Types.ObjectId.isValid(standard)) {
      targetBatchId = standard;
    } else {
      const matchBatch = await Batch.findOne({ name: standard, academicYear: req.viewingYear });
      if (matchBatch) {
        targetBatchId = matchBatch._id;
      } else {
        req.session.error = `Batch "${standard}" not found in current academic year.`;
        return res.redirect("/teacher/timetable");
      }
    }

    await ExamTimetable.updateMany(
      { _id: { $in: examIds } },
      {
        $set: {
          batch: targetBatchId,
          examType,
          subject,
          examDate: new Date(examDate),
          chapters
        }
      }
    );

    req.session.success = "Successfully updated exam entry!";
    res.redirect("/teacher/timetable");
  } catch (err) {
    console.error("Timetable edit error:", err);
    req.session.error = "Failed to update exam entry.";
    res.redirect("/teacher/timetable");
  }
};

exports.processTimetableDelete = async (req, res) => {
  try {
    const examIds = req.params.id.split(",");
    await ExamTimetable.deleteMany({ _id: { $in: examIds } });
    req.session.success = "Successfully deleted exam entry!";
    res.redirect("/teacher/timetable");
  } catch (err) {
    console.error("Timetable delete error:", err);
    req.session.error = "Failed to delete exam entry.";
    res.redirect("/teacher/timetable");
  }
};
