const User = require("../../models/User");
const ExamTimetable = require("../../models/ExamTimetable");
const axios = require("axios");

exports.renderTimetable = async (req, res) => {
  try {
    const student = await User.findById(req.session.userId).populate('batch').lean();
    if (!student) return res.redirect("/student/login");

    const studentBatchId = student.batch ? student.batch._id : null;
    if (!studentBatchId) {
      return res.render("student/timetable", { student, entries: [], success: null, error: "No batch assigned to your profile." });
    }

    const entries = await ExamTimetable.find({
      batch: studentBatchId,
      $or: [
        { addedBy: "teacher" },
        { addedBy: "student", addedById: student.studentId }
      ]
    })
      .sort({ examDate: 1 })
      .lean();

    res.render("student/timetable", {
      student,
      entries,
      success: req.session.success || null,
      error: req.session.error || null
    });
    req.session.success = null;
    req.session.error = null;
  } catch (err) {
    console.error("Error fetching student timetable:", err);
    res.status(500).send("Server Error");
  }
};

exports.processTimetableBulk = async (req, res) => {
  try {
    const student = await User.findById(req.session.userId).populate('batch');
    if (!student) return res.redirect("/student/login");

    const studentBatchId = student.batch ? student.batch._id : null;
    if (!studentBatchId) {
      req.session.error = "No batch assigned to your profile.";
      return res.redirect("/student/timetable");
    }

    const { examType, subjects, dates, chapters, otherSubjects } = req.body;
    if (!examType || !subjects || !dates || !chapters) {
      req.session.error = "All fields are required.";
      return res.redirect("/student/timetable");
    }

    const operations = [];
    for (let i = 0; i < subjects.length; i++) {
      if (!subjects[i] || !dates[i]) continue;
      let finalSubject = subjects[i];
      if (finalSubject === 'Other' && otherSubjects && otherSubjects[i]) {
        finalSubject = otherSubjects[i];
      }
      
      operations.push({
        batch: studentBatchId,
        studentRef: student._id,
        examType,
        subject: finalSubject,
        examDate: new Date(dates[i]),
        chapters: chapters[i] || "All",
        addedBy: "student",
        addedById: student.studentId,
        addedByName: student.studentName,
        addedByBatch: studentBatchId
      });
    }

    if (operations.length > 0) {
      await ExamTimetable.insertMany(operations);
      req.session.success = `Successfully scheduled ${operations.length} exams!`;
    } else {
      req.session.error = "No valid exam rows to add.";
    }
    res.redirect("/student/timetable");
  } catch (err) {
    console.error("Error bulk adding student timetable:", err);
    req.session.error = "Failed to schedule exams.";
    res.redirect("/student/timetable");
  }
};

exports.processTimetableEdit = async (req, res) => {
  try {
    const student = await User.findById(req.session.userId);
    if (!student) return res.redirect("/student/login");

    const entry = await ExamTimetable.findById(req.params.id);
    if (!entry) {
      req.session.error = "Exam entry not found.";
      return res.redirect("/student/timetable");
    }

    if (entry.addedBy !== "student" || entry.addedById !== student.studentId) {
      req.session.error = "You are not authorized to edit this exam.";
      return res.redirect("/student/timetable");
    }

    const { examType, subject, otherSubject, examDate, chapters } = req.body;
    entry.examType = examType;
    entry.subject = (subject === 'Other' && otherSubject) ? otherSubject : subject;
    entry.examDate = new Date(examDate);
    entry.chapters = chapters;

    await entry.save();
    req.session.success = "Exam entry updated successfully!";
    res.redirect("/student/timetable");
  } catch (err) {
    console.error("Error editing student timetable:", err);
    req.session.error = "Failed to update exam entry.";
    res.redirect("/student/timetable");
  }
};

exports.processTimetableDelete = async (req, res) => {
  try {
    const student = await User.findById(req.session.userId);
    if (!student) return res.redirect("/student/login");

    const entry = await ExamTimetable.findById(req.params.id);
    if (!entry) {
      req.session.error = "Exam entry not found.";
      return res.redirect("/student/timetable");
    }

    if (entry.addedBy !== "student" || entry.addedById !== student.studentId) {
      req.session.error = "You are not authorized to delete this exam.";
      return res.redirect("/student/timetable");
    }

    await ExamTimetable.findByIdAndDelete(req.params.id);
    req.session.success = "Exam entry deleted successfully!";
    res.redirect("/student/timetable");
  } catch (err) {
    console.error("Error deleting student timetable:", err);
    req.session.error = "Failed to delete exam entry.";
    res.redirect("/student/timetable");
  }
};

exports.processTimetableOCR = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No image uploaded." });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ success: false, message: "Server AI configuration missing." });
    }

    const base64Image = req.file.buffer.toString("base64");
    const mimeType = req.file.mimetype;

    // Parse available subjects sent from the frontend
    let availableSubjects = [];
    try {
      if (req.body.availableSubjects) {
        availableSubjects = JSON.parse(req.body.availableSubjects);
      }
    } catch (e) { /* ignore */ }

    const subjectMatchingInstruction = availableSubjects.length > 0
      ? `\nSUBJECT MATCHING (very important): The student's batch uses these subjects: [${availableSubjects.map(s => `"${s}"`).join(', ')}]. 
When you extract a subject name, check if it matches or closely corresponds to one of these. Use the EXACT spelling from this list if it's a match (e.g. if the timetable says "MATHS" and the list has "Maths", output "Maths"). If it does NOT match any in the list, output the extracted name as-is.`
      : '';

    const prompt = `You are a data extraction assistant. I am providing an image of an exam timetable. 
Please extract the tabular data and return it as a JSON array of objects.
Each object should have the following keys:
- "subject": The name of the subject or exam. Format in Title Case.
- "date": The date of the exam in YYYY-MM-DD format (infer the current year if missing, assume it's an upcoming exam).
- "chapters": The syllabus, chapters, or topics covered. If not explicitly mentioned, just output "All".
${subjectMatchingInstruction}
IMPORTANT RULES:
1. If a single subject has MULTIPLE dates (e.g. '12, 15, 17 March'), you MUST create a separate JSON object for EACH date with the same subject.
2. Do NOT return any markdown formatting, only raw JSON. If you cannot find any timetable data, return an empty array [].`;

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent`,
      {
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Image
                }
              }
            ]
          }
        ],
        generationConfig: {
          response_mime_type: "application/json"
        }
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        }
      }
    );

    let outputText = "";
    if (
      response.data &&
      response.data.candidates &&
      response.data.candidates[0] &&
      response.data.candidates[0].content &&
      response.data.candidates[0].content.parts &&
      response.data.candidates[0].content.parts[0]
    ) {
      outputText = response.data.candidates[0].content.parts[0].text;
    } else {
      throw new Error("Invalid response structure from Gemini API");
    }

    // Clean up markdown block wrapping if Gemini decides to ignore instructions
    outputText = outputText.trim();
    if (outputText.startsWith("\`\`\`json")) {
      outputText = outputText.substring(7);
    } else if (outputText.startsWith("\`\`\`")) {
      outputText = outputText.substring(3);
    }
    if (outputText.endsWith("\`\`\`")) {
      outputText = outputText.substring(0, outputText.length - 3);
    }

    const parsedData = JSON.parse(outputText.trim());
    res.json({ success: true, data: parsedData });
  } catch (err) {
    const errorDetails = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error("Gemini AI OCR Error:", errorDetails);
    res.status(500).json({ success: false, message: "Failed to parse timetable using AI." });
  }
};

