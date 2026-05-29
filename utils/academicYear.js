/**
 * Academic Year Utilities - SIMPLE VERSION (No Database)
 * Auto-calculates academic year based on May-April cycle
 * Returns format: YYYY-YY (e.g., 2025-26, 2026-27)
 */

/**
 * Calculate current academic year based on May-April cycle
 * May onwards: current year - next year (e.g., May 2025 → 2025-26)
 * January-April: previous year - current year (e.g., March 2026 → 2025-26)
 * @returns {string} Academic year in format "YYYY-YY" (e.g., "2025-26")
 */
function calculateCurrentAcademicYear() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-indexed (Jan=1, Dec=12)

  if (month >= 5) {
    // May onwards: current year - next year (e.g., 2025-26)
    return `${year}-${String(year + 1).slice(2)}`;
  } else {
    // January-April: previous year - current year (e.g., 2025-26)
    return `${year - 1}-${String(year).slice(2)}`;
  }
}

/**
 * Generate list of available academic years (current + past years)
 * @param {number} pastYears - Number of past years to include (default: 5)
 * @returns {Array<string>} Array of academic years in format "YYYY-YY"
 */
function getAvailableAcademicYears(pastYears = 5) {
  const currentYear = calculateCurrentAcademicYear();
  const years = [currentYear];

  // Extract start year from current academic year (e.g., "2025-26" → 2025)
  const startYear = parseInt(currentYear.split('-')[0]);

  // Generate past academic years
  for (let i = 1; i <= pastYears; i++) {
    const year = startYear - i;
    years.push(`${year}-${String(year + 1).slice(2)}`);
  }

  return years;
}

// Test cases:
// March 21, 2026 → month=3 < 5 → returns "2025-26" ✓
// June 1, 2026  → month=6 ≥ 5 → returns "2026-27" ✓
// May 1, 2025   → month=5 ≥ 5 → returns "2025-26" ✓

module.exports = {
  calculateCurrentAcademicYear,
  getAvailableAcademicYears
};
