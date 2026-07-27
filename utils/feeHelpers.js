const { ACADEMIC_MONTHS } = require("./constants");

// A fee row stored with this status means the month simply does not apply to the
// student — they joined mid-year, or took a break. It is neither paid nor due, so
// it stays out of receivables, defaulters and the collection sheet.
const NA_STATUS = "NA";

// Offered as suggestions in the UI — a teacher can still type their own.
const NA_REASONS = [
  "Joined mid-year",
  "Left the class",
  "On a break",
  "Fee waived",
  "Admission not confirmed",
];

// The academic year runs May -> April, so January onwards falls in the next calendar year.
function feeYearForMonth(month, academicYearStr) {
  const idx = ACADEMIC_MONTHS.indexOf(month);
  const startYear = parseInt(String(academicYearStr || "").split("-")[0], 10);
  if (idx === -1 || Number.isNaN(startYear)) return new Date().getFullYear();
  return idx < 8 ? startYear : startYear + 1;
}

// Months marked not-applicable, out of one student's fee records.
function naMonthSet(feeRecords = []) {
  return new Set(
    feeRecords.filter((f) => f.status === NA_STATUS).map((f) => f.month)
  );
}

// Months the student is actually liable for, out of the ones passed in.
function billableMonths(months, naMonths) {
  if (!naMonths || naMonths.size === 0) return months;
  return months.filter((m) => !naMonths.has(m));
}

module.exports = { NA_STATUS, NA_REASONS, feeYearForMonth, naMonthSet, billableMonths };
