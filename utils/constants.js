// Global constants for data validation consistency

// Standard/Grade levels (e.g., "5", "6", "7", etc.)
const STANDARDS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

// Academic year format validator
// Enforces format: "YYYY-YY" (e.g., "2024-25")
const ACADEMIC_YEAR_REGEX = /^\d{4}-\d{2}$/;

// Material types for study materials
const MATERIAL_TYPES = ["PDF", "Video", "Document", "Link", "Image"];

// Attendance status codes
const ATTENDANCE_STATUS = ["P", "A", "H"]; // Present, Absent, Holiday

// Exam types
const EXAM_TYPES = [
  "Unit Test 1",
  "Unit Test 2",
  "Semester 1",
  "Semester 2",
  "Class Test",
];

// User roles
const USER_ROLES = ["student", "teacher", "admin"];

module.exports = {
  STANDARDS,
  ACADEMIC_YEAR_REGEX,
  MATERIAL_TYPES,
  ATTENDANCE_STATUS,
  EXAM_TYPES,
  USER_ROLES,
};
