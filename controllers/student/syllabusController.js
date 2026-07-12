const User = require("../../models/User");
const Syllabus = require("../../models/Syllabus");

exports.renderTracker = async (req, res) => {
  try {
    const student = await User.findById(req.session.userId).populate('batch').lean();
    if (!student || !student.batch) {
      return res.render("student/syllabus", { batchName: null, syllabusMap: {} });
    }

    const syllabusRecords = await Syllabus.find({ batch: student.batch._id }).lean();

    const syllabusMap = {};
    syllabusRecords.forEach(record => {
      syllabusMap[record.subject] = {
        chapterStatuses: record.chapterStatuses || {},
        totalChapters: record.totalChapters || 10
      };
    });

    res.render("student/syllabus", {
      batchName: student.batch.name,
      syllabusMap,
    });
  } catch (err) {
    console.error("Error rendering student syllabus tracker:", err);
    res.status(500).send("Error loading syllabus tracker.");
  }
};
