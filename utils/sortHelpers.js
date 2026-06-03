/**
 * Returns a numeric order value for a batch name.
 * Pre-Primary / KG batches come first (0), then numeric grades (1-10+),
 * then anything else (100), and unknown/null last (999).
 */
function getBatchOrderValue(name) {
  if (!name) return 999;
  const lowerName = name.toLowerCase();
  if (lowerName.includes("pre") || lowerName.includes("kg")) return 0;
  const match = lowerName.match(/(\d+)/);
  if (match) return parseInt(match[1]);
  return 100;
}

/**
 * Comparator: sorts students by batch order (Pre-Primary → 1st → ... → 10th),
 * then by studentId numerically.
 */
function sortStudentsByBatchAndId(a, b) {
  const batchA = a.batch ? (typeof a.batch === "object" ? a.batch.name : a.batch) : "";
  const batchB = b.batch ? (typeof b.batch === "object" ? b.batch.name : b.batch) : "";
  const orderA = getBatchOrderValue(batchA);
  const orderB = getBatchOrderValue(batchB);
  if (orderA !== orderB) return orderA - orderB;
  return (a.studentId || "").localeCompare(b.studentId || "", undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Comparator: sorts batch objects or batch names by the natural class order.
 */
function sortBatches(a, b) {
  const nameA = typeof a === "string" ? a : a.name;
  const nameB = typeof b === "string" ? b : b.name;
  return getBatchOrderValue(nameA) - getBatchOrderValue(nameB);
}

module.exports = { getBatchOrderValue, sortStudentsByBatchAndId, sortBatches };
