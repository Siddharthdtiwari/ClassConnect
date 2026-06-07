const SubjectConfig = {
  default: ['English', 'Maths', 'Science', 'Social Science', 'Hindi', 'Marathi'],
  '5th': ['English', 'Maths', 'Environmental Studies 1', 'Environmental Studies 2', 'Hindi', 'Marathi'],
  '6th-8th': ['English', 'Maths', 'Science', 'History', 'Geography', 'Civics', 'Hindi', 'Marathi'],
  '9th-10th': ['English', 'Maths I', 'Maths II', 'Science I', 'Science II', 'History', 'Political Science', 'Geography', 'Hindi', 'Marathi']
};

function getSubjectsForBatch(batchName) {
  if (!batchName) return SubjectConfig.default;
  const name = batchName.toLowerCase();

  // 5th standard
  if (name.includes('5th') || name.includes(' v ') || name.endsWith(' v') || name === 'v') {
    return SubjectConfig['5th'];
  }
  // 6th to 8th standard
  if (name.includes('6th') || name.includes('7th') || name.includes('8th') ||
    name.includes('vi') || name.includes('vii') || name.includes('viii')) {
    return SubjectConfig['6th-8th'];
  }
  // 9th and 10th standard
  if (name.includes('9th') || name.includes('10th') ||
    name.includes('ix') || name.includes('x')) {
    return SubjectConfig['9th-10th'];
  }

  return SubjectConfig.default;
}

function updateSubjectDropdowns(dropdowns, batchName) {
  const subjects = getSubjectsForBatch(batchName);
  const optionsHtml = `<option value="" disabled selected>Select Subject...</option>` +
    subjects.map(s => `<option value="${s}">${s}</option>`).join('');

  dropdowns.forEach(dropdown => {
    // preserve value if it exists in new options
    const prevVal = dropdown.value;
    dropdown.innerHTML = optionsHtml;

    if (prevVal && subjects.includes(prevVal)) {
      dropdown.value = prevVal;
    } else {
      dropdown.value = '';
    }
  });
}

// Helper to generate the options HTML directly (useful when creating new elements)
function getSubjectOptionsHtml(batchName) {
  const subjects = getSubjectsForBatch(batchName);
  return `<option value="" disabled selected>Select Subject...</option>` +
    subjects.map(s => `<option value="${s}">${s}</option>`).join('');
}
