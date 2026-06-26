const Batch = require("../../models/Batch");
const Test = require("../../models/Test");
const Score = require("../../models/Score");
const axios = require("axios");
const User = require("../../models/User");
const ExamTimetable = require("../../models/ExamTimetable");
const mongoose = require("mongoose");
const { sortStudentsByBatchAndId, sortBatches } = require("../../utils/sortHelpers");
const { uploadToCloudinary } = require("../../utils/upload");
const { logAudit } = require("../../utils/auditService");
const { sendTestMarks } = require("../../utils/emailService");

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

    res.render("teacher/manage_tests", { tests, byClass, batches });
  } catch (err) {
    console.error("Manage tests error:", err);
    res.status(500).send("Error");
  }
};
exports.renderGeneratePaper = async (req, res) => {
  try {
    const batches = await Batch.find({ academicYear: req.viewingYear });
    batches.sort(sortBatches);
    res.render("teacher/generate_paper", { batches });
  } catch (err) {
    console.error("Render generate paper page error:", err);
    res.status(500).send("Error");
  }
};



exports.processDeleteTest = async (req, res) => {
  try {
    await Test.findByIdAndDelete(req.params.id);
    await Score.deleteMany({ testId: req.params.id });
    await logAudit({
      action: "DELETE",
      entityType: "Test",
      entityId: req.params.id,
      details: `Deleted test`,
      academicYear: req.viewingYear
    });
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

const { calculatePercentage } = require("../../utils/constants");

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
    const emailsToSend = [];
    for (const s of scores) {
      const student = await User.findOne({ studentId: s.studentId, batch: test.batch });
      if (!student) continue;

      const percentage = calculatePercentage(s.score, test.totalMarks);

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
      
      if (student.email) {
        emailsToSend.push({
          email: student.email,
          name: student.studentName,
          score: s.score,
          percentage,
          studentRef: student._id
        });
      }
    }

    if (operations.length > 0) {
      await Score.bulkWrite(operations);
      await logAudit({
        action: "BULK_UPDATE",
        entityType: "Score",
        details: `Saved scores for test: ${test.testName}`,
        academicYear: req.viewingYear
      });
      
      // Send emails asynchronously but wait for them to finish before responding in Serverless env
      await Promise.all(emailsToSend.map(record => {
        const logMeta = { studentRef: record.studentRef, academicYear: req.viewingYear };
        return sendTestMarks(
          record.email, 
          record.name, 
          test.testName, 
          test.subject, 
          record.score, 
          test.totalMarks, 
          record.percentage, 
          logMeta
        ).catch(e => console.error("Failed to send test marks email:", e));
      }));
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
      await logAudit({
        action: "CREATE",
        entityType: "Test",
        details: `Scheduled ${operations.length} exams for ${batch.name}`,
        academicYear: req.viewingYear
      });
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

    await logAudit({
      action: "UPDATE",
      entityType: "Test",
      details: `Updated exam timetable entry for ${subject}`,
      academicYear: req.viewingYear
    });

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
    await logAudit({
      action: "DELETE",
      entityType: "Test",
      details: `Deleted ${examIds.length} exam timetable entries`,
      academicYear: req.viewingYear
    });
    req.session.success = "Successfully deleted exam entry!";
    res.redirect("/teacher/timetable");
  } catch (err) {
    console.error("Timetable delete error:", err);
    req.session.error = "Failed to delete exam entry.";
    res.redirect("/teacher/timetable");
  }
};

exports.processAddTest = async (req, res) => {
  try {
    const { testName, batchId, subject, topic, totalMarks, testDate, questionPaperLink } = req.body;

    let questionPaperUrl = "";
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, "question-papers");
      questionPaperUrl = result.secure_url;
    } else if (questionPaperLink) {
      questionPaperUrl = questionPaperLink;
    }

    if (!questionPaperUrl) {
      return res.status(400).json({ success: false, message: "Please upload a question paper file or provide a link." });
    }

    const newTest = new Test({
      testName,
      batch: batchId,
      subject,
      topic,
      totalMarks,
      testDate: testDate || new Date(),
      questionPaper: questionPaperUrl
    });

    await newTest.save();
    await logAudit({
      action: "CREATE",
      entityType: "Test",
      entityId: newTest._id,
      details: `Created new test: ${testName}`,
      academicYear: req.viewingYear
    });
    res.json({ success: true, message: "Test added successfully!" });
  } catch (err) {
    console.error("Add test process error:", err);
    res.status(500).json({ success: false, message: "Failed to add test." });
  }
};

exports.generatePaperAI = async (req, res) => {
  try {
    const { contextText, subject, topic, totalMarks, instructions, currentHtml, refinePrompt } = req.body;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ success: false, message: "Gemini API key is not configured on the server." });
    }

    let prompt = "";

    if (refinePrompt && currentHtml) {
      prompt = `
You are an expert school teacher. You are editing an existing question paper.
Below is the current question paper HTML:
"""
${currentHtml}
"""

The user has requested the following modifications to this question paper:
"${refinePrompt}"

Apply the requested changes to the question paper HTML and return ONLY the updated, valid HTML.
Follow these constraints strictly:
1. Return ONLY valid HTML that can be directly inserted inside a div container.
2. DO NOT wrap the output in markdown code blocks like \`\`\`html ... \`\`\`. Start directly with the HTML tag (e.g., <div> or <style>).
3. Do not include <html>, <head>, or <body> tags. Just the content elements.
4. Maintain the existing styling (e.g., the embedded <style> tag) and structure of the document unless specifically asked to change it.
5. If questions or marks are added/removed/edited, ensure the question numbers and sections are clean, and the marks are explicitly updated where appropriate.
6. Ensure that you return the ENTIRE updated HTML document content (not just a snippet or diff) so that it can completely replace the editor canvas.
`;
    } else {
      if (!contextText) {
        return res.status(400).json({ success: false, message: "Please provide textbook context/questions." });
      }

      prompt = `
You are an expert school teacher. Generate a professional, print-ready question paper based on the textbook context and parameters provided below.

PARAMETERS:
- Subject: ${subject || "General Science"}
- Topic/Chapter: ${topic || "General"}
- Total Marks: ${totalMarks || "25"}
- Custom Instructions: ${instructions || "None"}

TEXTBOOK CONTEXT / SOURCE QUESTIONS:
"""
${contextText}
"""

OUTPUT FORMAT REQUIREMENTS:
1. Return ONLY valid HTML that can be directly inserted inside a div container.
2. DO NOT wrap the output in markdown code blocks like \`\`\`html ... \`\`\`. Start directly with the HTML tag (e.g., <div> or <header>).
3. Do not include <html>, <head>, or <body> tags. Just the content elements.
4. The HTML MUST contain an embedded <style> tag. Customize the styles to match a premium report or fee receipt theme using the CSS classes below:

\`\`\`css
/* Embedded Stylesheet for the Question Paper */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@700&display=swap');
.paper-container {
  background-color: #fafafa;
  padding: 30px;
  position: relative;
  font-family: 'Inter', sans-serif;
  color: #1f2937;
  line-height: 1.6;
}
.watermark {
  position: absolute;
  top: 0; left: 0; width: 100%; height: 100%;
  pointer-events: none;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='250' height='150' viewBox='0 0 250 150'><text fill='rgba(75, 45, 132, 0.04)' font-family='sans-serif' font-size='10' dy='12' transform='rotate(-30 125 75)' text-anchor='middle'>TUITION HUB EDUCATION CENTRE</text></svg>");
  background-repeat: repeat;
  z-index: 0;
}
.paper-header {
  background: linear-gradient(135deg, #4b2d84 0%, #6b46c1 100%);
  color: white;
  padding: 24px;
  border-radius: 12px;
  margin-bottom: 24px;
  position: relative;
  overflow: hidden;
  z-index: 1;
}
.paper-header h1 {
  font-family: 'Playfair Display', serif;
  font-size: 24px;
  margin: 0 0 6px 0;
  text-align: center;
  font-weight: 700;
  letter-spacing: 1px;
}
.paper-header h2 {
  font-size: 13px;
  margin: 0 0 16px 0;
  text-align: center;
  font-weight: 500;
  color: #e9d5ff;
}
.info-table {
  width: 100%;
  border-collapse: collapse;
}
.info-table td {
  border: none !important;
  color: white;
  padding: 4px 8px;
  font-size: 12px;
}
.info-table td strong {
  color: #e9d5ff;
}
.info-underline {
  border-bottom: 1px dashed rgba(255, 255, 255, 0.6);
  display: inline-block;
  width: 120px;
  margin-left: 5px;
}
.instructions-card {
  background: white;
  border: 1px solid #e5e7eb;
  border-left: 5px solid #bde045;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 24px;
  font-size: 13px;
  position: relative;
  z-index: 1;
}
.instructions-card h3 {
  margin-top: 0;
  margin-bottom: 8px;
  color: #4b2d84;
  font-weight: 700;
  font-size: 14px;
}
.instructions-card ul {
  margin: 0;
  padding-left: 20px;
}
.section-title {
  font-family: 'Playfair Display', serif;
  color: #4b2d84;
  font-size: 16px;
  border-bottom: 2px solid #6b46c1;
  padding-bottom: 4px;
  margin-top: 25px;
  margin-bottom: 15px;
  font-weight: 700;
  position: relative;
  z-index: 1;
}
.question-list {
  padding-left: 20px;
  margin: 0;
}
.question-item {
  margin-bottom: 20px;
  position: relative;
  z-index: 1;
}
.question-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  font-weight: 500;
}
.question-text {
  flex: 1;
}
.question-marks {
  color: #4b2d84;
  font-weight: 750;
  font-size: 13px;
  white-space: nowrap;
  margin-left: 10px;
}
.mcq-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 8px;
  list-style-type: none;
  padding-left: 0;
}
.option-item {
  font-size: 13px;
}
\`\`\`

5. Use the following structure for the HTML body:
\`\`\`html
<div class="paper-container">
  <div class="watermark"></div>
  <div class="paper-header">
    <h1>TUITION HUB EDUCATION CENTRE</h1>
    <h2>TEST PAPER: SUBJECT - TOPIC</h2>
    <table class="info-table">
      <tr>
        <td><strong>Student Name:</strong> <span class="info-underline"></span></td>
        <td><strong>Roll No:</strong> <span class="info-underline"></span></td>
      </tr>
      <tr>
        <td><strong>Date:</strong> <span class="info-underline"></span></td>
        <td><strong>Marks:</strong> ______ / TOTAL_MARKS</td>
      </tr>
    </table>
  </div>
  <div class="instructions-card">
    <h3>INSTRUCTIONS</h3>
    <ul>
      <li>All questions are compulsory.</li>
      <li>Custom instructions from parameters...</li>
    </ul>
  </div>
  <!-- Sections and questions using .section-title, .question-list, .question-item, etc. -->
</div>
\`\`\`
6. Clearly denote marks for each question at the end of the question (e.g., [2 Marks]).
7. Make sure the total marks of all questions sum up to exactly the specified total marks.
`;
    }

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent`,
      {
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ]
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        }
      }
    );

    let htmlContent = "";
    if (
      response.data &&
      response.data.candidates &&
      response.data.candidates[0] &&
      response.data.candidates[0].content &&
      response.data.candidates[0].content.parts &&
      response.data.candidates[0].content.parts[0]
    ) {
      htmlContent = response.data.candidates[0].content.parts[0].text;
    } else {
      throw new Error("Invalid response structure from Gemini API");
    }

    // Clean up markdown block wrapping if Gemini decides to ignore instructions and returns it
    htmlContent = htmlContent.trim();
    if (htmlContent.startsWith("```html")) {
      htmlContent = htmlContent.substring(7);
    } else if (htmlContent.startsWith("```")) {
      htmlContent = htmlContent.substring(3);
    }
    if (htmlContent.endsWith("```")) {
      htmlContent = htmlContent.substring(0, htmlContent.length - 3);
    }
    htmlContent = htmlContent.trim();

    res.json({ success: true, html: htmlContent });
  } catch (err) {
    const errorDetails = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error("Gemini AI API Call Error:", errorDetails);
    res.status(500).json({ success: false, message: "Failed to generate paper using AI. " + errorDetails });
  }
};

exports.processEditTest = async (req, res) => {
  try {
    const { testName, batchId, subject, topic, totalMarks, testDate, questionPaperLink } = req.body;
    const testId = req.params.id;

    const test = await Test.findById(testId);
    if (!test) {
      return res.status(404).json({ success: false, message: "Test not found." });
    }

    let questionPaperUrl = test.questionPaper;
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, "question-papers");
      questionPaperUrl = result.secure_url;
    } else if (questionPaperLink && questionPaperLink.trim() !== "") {
      questionPaperUrl = questionPaperLink;
    }

    if (!questionPaperUrl) {
      return res.status(400).json({ success: false, message: "Please upload a question paper file or provide a link." });
    }

    test.testName = testName;
    test.batch = batchId;
    test.subject = subject;
    test.topic = topic;
    test.totalMarks = Number(totalMarks);
    test.testDate = testDate ? new Date(testDate) : test.testDate;
    test.questionPaper = questionPaperUrl;

    await test.save(); // Triggers save hooks for score percentage recalculation

    await logAudit({
      action: "UPDATE",
      entityType: "Test",
      entityId: test._id,
      details: `Updated test: ${testName}`,
      academicYear: req.viewingYear
    });

    res.json({ success: true, message: "Test updated successfully!" });
  } catch (err) {
    console.error("Edit test process error:", err);
    res.status(500).json({ success: false, message: "Failed to update test. Server error." });
  }
};



