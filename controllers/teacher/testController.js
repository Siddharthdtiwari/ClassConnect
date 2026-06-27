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

exports.renderViewPaper = async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test || !test.htmlContent) {
      return res.status(404).send("Paper not found or it is a PDF.");
    }
    res.render("teacher/view_paper", { test });
  } catch (err) {
    console.error("View paper error:", err);
    res.status(500).send("Error rendering paper");
  }
};



exports.processDeleteTest = async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    const batchId = test ? test.batch : null;
    await Test.findByIdAndDelete(req.params.id);
    await Score.deleteMany({ testId: req.params.id });
    if (batchId) {
      await User.recalculatePoints(batchId);
    }
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

      await User.recalculatePoints(test.batch);
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
    const { testName, batchId, subject, topic, totalMarks, testDate, questionPaperLink, htmlContent } = req.body;

    let questionPaperUrl = "";
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, "question-papers");
      questionPaperUrl = result.secure_url;
    } else if (questionPaperLink) {
      questionPaperUrl = questionPaperLink;
    } else if (htmlContent) {
      questionPaperUrl = "HTML_CONTENT";
    }

    if (!questionPaperUrl) {
      return res.status(400).json({ success: false, message: "Please upload a question paper file or provide a link." });
    }

    const newTest = new Test({
      testName,
      batch: batchId,
      subject,
      topic: topic || "General",
      totalMarks: totalMarks ? Number(totalMarks) : 100,
      testDate: testDate || new Date(),
      questionPaper: questionPaperUrl,
      htmlContent: htmlContent || ""
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
    const { 
      contextText, subject, topic, totalMarks, instructions, currentHtml, refinePrompt,
      batchName, testName, time, testDate, includeLogo, includeSlanting
    } = req.body;

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
- Batch / Class: ${batchName || ""}
- Subject: ${subject || "General Science"}
- Class Test Name/Number: ${testName || ""}
- Time: ${time || ""}
- Total Marks: ${totalMarks || ""}
- Topic/Chapter: ${topic || "General"}
- Custom Instructions: ${instructions || "None"}

TEXTBOOK CONTEXT / SOURCE QUESTIONS:
"""
${contextText}
"""

OUTPUT FORMAT REQUIREMENTS:
1. Return ONLY valid HTML. Start directly with the HTML tag (e.g., <div class="paper-container">).
2. DO NOT wrap the output in markdown code blocks like \`\`\`html ... \`\`\`.
3. Do not include <html>, <head>, <body>, or <style> tags. Just the HTML content elements.
4. Use the following predefined CSS classes for styling (the CSS is already loaded by the application):
   - \`paper-container\`: The main wrapper
   - \`watermark\`: For the slanting text background
   - \`watermark-logo\`: For the logo background
   - \`paper-top-branding\`: For the header image wrapper
   - \`branding-image\`: For the header image itself
   - \`paper-body\`: For the main content area below the banner
   - \`paper-meta-row\`: For the row containing class, subject, etc.
   - \`section-title\`: For section headers
   - \`question-list\`: For the list of questions
   - \`question-item\`: For each question
   - \`question-text\`: For the question title/text
   - \`question-marks\`: For the marks

5. Use the exact structure below:
\`\`\`html
<div class="paper-container">
  ${includeSlanting ? '<div class="watermark"></div>' : ''}
  ${includeLogo ? '<div class="watermark-logo"></div>' : ''}
  <div class="paper-top-branding">
    <img src="${process.env.CLOUDINARY_HEADER_URL || 'https://res.cloudinary.com/dcb40l6ou/image/upload/v1731653835/yep84k7z6k0yozh4sptd.png'}" class="branding-image" alt="Header Banner" />
  </div>
  <div class="paper-body">
    <div class="paper-meta-row" style="flex-direction: column; text-align: center; border-bottom: none; margin-bottom: 5px;">
        <h2 style="font-size: 16px; margin: 0 0 5px 0; text-transform: uppercase;">${testName || 'Class Test'}</h2>
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #000; padding-bottom: 8px;">
          <span>Class: <strong>${batchName || '____'}</strong></span>
          <span>Subject: <strong>${subject || '____'}</strong></span>
          <span>Marks: <strong>${totalMarks || '____'}</strong></span>
          ${time ? `<span>Time: <strong>${time}</strong></span>` : ''}
          <span>Date: <strong>${testDate || new Date().toLocaleDateString('en-IN')}</strong></span>
        </div>
    </div>
    <!-- Sections and questions using .section-title, .question-list, .question-item, .question-text, .question-marks -->
  </div>
</div>
\`\`\`
6. Clearly denote marks for each question at the end of the question (e.g., [2]).
7. Make sure the total marks of all questions sum up to exactly the specified total marks.
8. DO NOT use LaTeX formatting (like \\frac, $$, \\alpha). Strictly use standard HTML tags (like <sup>, <sub>, &frac12;, &pi;) for all mathematical symbols and equations.
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



