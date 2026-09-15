const PDFDocument = require('pdfkit');
const axios = require('axios');

const STATUS_COLORS = {
  P: { bg: '#d1fae5', text: '#065f46' },
  A: { bg: '#fee2e2', text: '#991b1b' },
  H: { bg: '#ede9fe', text: '#4b2d84' },
};

const MIN_DATE_COL_W = 15;
const MAX_DATE_COL_W = 26;

const getBatchOrderValue = (name) => {
  if (!name) return 999;
  const lowerName = name.toLowerCase();
  if (lowerName.includes('pre') || lowerName.includes('kg')) return 0;
  const match = lowerName.match(/^(\d+)/);
  if (match) return parseInt(match[1]);
  return 100;
};

function formatDateHeader(dateKey) {
  const d = new Date(dateKey);
  return `${d.getDate()}`;
}

async function drawAttendanceLedger(doc, data) {
  const { students, rangeLabel, dateKeys } = data;
  const W = doc.page.width;
  const H = doc.page.height;
  const M = 32;

  const nameColW = 155;
  const overallColW = 48;
  const availableW = W - 2 * M - nameColW - overallColW;

  // Prefer a single, evenly-sized set of columns that fits every date on one
  // page (a typical month is 28-31 days) — only fall back to splitting across
  // continuation pages for genuinely long custom ranges.
  let dateColW = dateKeys.length > 0 ? Math.floor(availableW / dateKeys.length) : MAX_DATE_COL_W;
  dateColW = Math.max(MIN_DATE_COL_W, Math.min(MAX_DATE_COL_W, dateColW));
  const maxDateColsPerChunk = Math.max(1, Math.floor(availableW / dateColW));

  const dateChunks = [];
  for (let i = 0; i < dateKeys.length; i += maxDateColsPerChunk) {
    dateChunks.push(dateKeys.slice(i, i + maxDateColsPerChunk));
  }
  if (dateChunks.length === 0) dateChunks.push([]);

  const byBatch = {};
  students.forEach((s) => {
    const batchName = s.batch ? s.batch.name : 'Unassigned';
    if (!byBatch[batchName]) byBatch[batchName] = [];
    byBatch[batchName].push(s);
  });
  const sortedBatches = Object.keys(byBatch).sort((a, b) => getBatchOrderValue(a) - getBatchOrderValue(b));
  const isSingleStudent = students.length === 1;

  let headerImageBuffer = null;
  try {
    const headerUrl = process.env.CLOUDINARY_HEADER_URL;
    if (headerUrl) {
      const response = await axios.get(headerUrl, { responseType: 'arraybuffer', timeout: 5000 });
      headerImageBuffer = Buffer.from(response.data, 'binary');
    }
  } catch (_) {}

  function drawWatermark() {
    doc.save();
    doc.fillOpacity(0.04);
    doc.fillColor('#4b2d84');
    doc.font('Times-Bold').fontSize(10);
    const text = 'TUITION HUB EDU CENTER - ATTENDANCE LEDGER    ';
    for (let y = -50; y < H + 100; y += 80) {
      for (let x = -50; x < W + 100; x += 200) {
        doc.save();
        doc.translate(x, y);
        doc.rotate(-30);
        doc.text(text, 0, 0);
        doc.restore();
      }
    }
    doc.restore();
  }

  let isFirstPage = true;
  function drawPageHeader(chunkIndex, totalChunks) {
    doc.rect(0, 0, W, H).fill('#f8f7fc');
    drawWatermark();

    let headerHeight;
    if (isFirstPage) {
      headerHeight = 96;
      const grad = doc.linearGradient(0, 0, W, headerHeight);
      grad.stop(0, '#4b2d84').stop(1, '#7c3aed');
      doc.rect(0, 0, W, headerHeight).fill(grad);

      doc.save();
      doc.fillOpacity(0.1);
      doc.circle(W - 30, headerHeight - 20, 65).fill('white');
      doc.circle(60, -10, 45).fill('white');
      doc.restore();

      if (headerImageBuffer) {
        doc.roundedRect(M, 16, 150, 42, 6).fill('white');
        doc.image(headerImageBuffer, M + 6, 22, { fit: [138, 30], align: 'center' });
      }

      doc.fillColor('white').font('Times-Bold').fontSize(21)
        .text('ATTENDANCE LEDGER', M, headerHeight - 34, { align: 'left' });

      doc.fillColor('#e9d5ff').font('Times-Bold').fontSize(12)
        .text(rangeLabel, W - M - 280, 20, { align: 'right', width: 280 });
      doc.fillColor('#d8b4fe').font('Times-Roman').fontSize(8.5)
        .text(`Generated ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`, W - M - 280, 36, { align: 'right', width: 280 });
      if (totalChunks > 1) {
        doc.fillColor('#d8b4fe').font('Times-Roman').fontSize(8.5)
          .text(`Columns ${chunkIndex + 1} of ${totalChunks}`, W - M - 280, 49, { align: 'right', width: 280 });
      }

      isFirstPage = false;
    } else {
      headerHeight = 32;
      const grad = doc.linearGradient(0, 0, W, headerHeight);
      grad.stop(0, '#4b2d84').stop(1, '#7c3aed');
      doc.rect(0, 0, W, headerHeight).fill(grad);
      doc.fillColor('white').font('Times-Bold').fontSize(10)
        .text(`ATTENDANCE LEDGER — ${rangeLabel} (CONT.)`, M, 11, { align: 'center', width: W - 2 * M });
    }

    return headerHeight + 18;
  }

  function drawLegend(y) {
    const items = [
      { label: 'Present', color: STATUS_COLORS.P.bg, text: STATUS_COLORS.P.text },
      { label: 'Absent', color: STATUS_COLORS.A.bg, text: STATUS_COLORS.A.text },
      { label: 'Holiday', color: STATUS_COLORS.H.bg, text: STATUS_COLORS.H.text },
      { label: 'Not Recorded', color: '#f3f4f6', text: '#9ca3af' },
    ];
    let x = M;
    items.forEach((item) => {
      doc.roundedRect(x, y, 13, 13, 3).fill(item.color);
      doc.fillColor(item.text).font('Times-Bold').fontSize(7).text(item.label.charAt(0), x, y + 3, { width: 13, align: 'center' });
      doc.fillColor('#4b5563').font('Times-Roman').fontSize(8.5).text(item.label, x + 18, y + 2.5);
      x += 18 + doc.widthOfString(item.label) + 20;
    });
    return y + 24;
  }

  // A single-student export gets a small profile/summary strip instead of a
  // bare percentage cell, since there's a lot of empty page to put it to use.
  function drawStudentSummaryCard(y, student) {
    const cardH = 62;
    const cardW = W - 2 * M;
    doc.roundedRect(M, y, cardW, cardH, 10).fill('white');
    doc.roundedRect(M, y, cardW, cardH, 10).lineWidth(1).stroke('#e9d5ff');
    doc.roundedRect(M, y, 5, cardH, 3).fill('#7c3aed');

    doc.fillColor('#9ca3af').font('Times-Roman').fontSize(7.5).text('STUDENT', M + 22, y + 12, { characterSpacing: 1 });
    doc.fillColor('#111827').font('Times-Bold').fontSize(13).text(student.studentName, M + 22, y + 22);
    doc.fillColor('#7c3aed').font('Times-Bold').fontSize(8.5).text(`${student.studentId}  ·  Batch: ${student.batch ? student.batch.name : 'Unassigned'}`, M + 22, y + 41);

    const stats = [
      { label: 'PRESENT', value: student.presentCount, color: '#059669' },
      { label: 'ABSENT', value: student.totalRecordedDays - student.presentCount, color: '#dc2626' },
      { label: 'OVERALL %', value: student.totalRecordedDays > 0 ? `${((student.presentCount / student.totalRecordedDays) * 100).toFixed(0)}%` : 'N/A', color: '#4b2d84' },
    ];
    const statBlockW = 110;
    let statX = M + cardW - stats.length * statBlockW - 10;
    stats.forEach((s) => {
      doc.fillColor('#9ca3af').font('Times-Roman').fontSize(7).text(s.label, statX, y + 14, { width: statBlockW, align: 'center', characterSpacing: 1 });
      doc.fillColor(s.color).font('Times-Bold').fontSize(20).text(String(s.value), statX, y + 25, { width: statBlockW, align: 'center' });
      statX += statBlockW;
    });

    return y + cardH + 18;
  }

  for (let chunkIdx = 0; chunkIdx < dateChunks.length; chunkIdx++) {
    const chunkDates = dateChunks[chunkIdx];
    const isLastChunk = chunkIdx === dateChunks.length - 1;

    if (chunkIdx > 0) doc.addPage();
    let cursorY = drawPageHeader(chunkIdx, dateChunks.length);
    if (chunkIdx === 0) {
      cursorY = drawLegend(cursorY);
      if (isSingleStudent) cursorY = drawStudentSummaryCard(cursorY, students[0]);
    }

    const tableW = nameColW + chunkDates.length * dateColW + (isLastChunk ? overallColW : 0);
    const tableM = (W - tableW) / 2;
    const tableTopY = cursorY;

    function checkPageAdd(heightNeeded) {
      if (cursorY + heightNeeded > H - 42) {
        doc.addPage();
        cursorY = drawPageHeader(chunkIdx, dateChunks.length);
        drawTableHeader();
      }
    }

    function drawTableHeader() {
      doc.roundedRect(tableM, cursorY, tableW, 24, cursorY === tableTopY ? 8 : 0).fill('#ede9fe');
      doc.lineWidth(0.75).roundedRect(tableM, cursorY, tableW, 24, cursorY === tableTopY ? 8 : 0).stroke('#ddd6fe');
      doc.fillColor('#4b2d84').font('Times-Bold').fontSize(8.5);
      doc.text('STUDENT', tableM + 8, cursorY + 8, { width: nameColW - 12 });
      let curX = tableM + nameColW;
      chunkDates.forEach((dateKey) => {
        doc.text(formatDateHeader(dateKey), curX, cursorY + 8, { width: dateColW, align: 'center' });
        curX += dateColW;
      });
      if (isLastChunk) {
        doc.text('%', curX, cursorY + 8, { width: overallColW, align: 'center' });
      }
      cursorY += 24;
    }

    drawTableHeader();

    for (const batchName of sortedBatches) {
      checkPageAdd(20);
      if (!isSingleStudent) {
        doc.rect(tableM, cursorY, tableW, 17).fill('#4b2d84');
        doc.fillColor('white').font('Times-Bold').fontSize(8)
          .text(`BATCH: ${batchName.toUpperCase()}`, tableM + 8, cursorY + 4.5);
        cursorY += 17;
      }

      const batchStudents = byBatch[batchName];
      batchStudents.forEach((student, i) => {
        checkPageAdd(17);
        const rowH = 17;
        const isEven = i % 2 === 0;
        doc.rect(tableM, cursorY, tableW, rowH).fill(isEven ? 'white' : '#faf9fd');

        doc.fillColor('#111827').font('Times-Bold').fontSize(7.5)
          .text(`${student.studentName} (${student.studentId})`, tableM + 8, cursorY + 5, { width: nameColW - 12, height: 12, ellipsis: true });

        let curX = tableM + nameColW;
        chunkDates.forEach((dateKey) => {
          const status = (student.records && student.records[dateKey]) || null;
          if (status && STATUS_COLORS[status]) {
            doc.roundedRect(curX + 2, cursorY + 2, dateColW - 4, rowH - 4, 3).fill(STATUS_COLORS[status].bg);
            doc.fillColor(STATUS_COLORS[status].text).font('Times-Bold').fontSize(7)
              .text(status, curX, cursorY + 5, { width: dateColW, align: 'center' });
          } else {
            doc.fillColor('#d1d5db').font('Times-Roman').fontSize(7)
              .text('-', curX, cursorY + 5, { width: dateColW, align: 'center' });
          }
          curX += dateColW;
        });

        if (isLastChunk) {
          const pct = student.totalRecordedDays > 0
            ? ((student.presentCount / student.totalRecordedDays) * 100).toFixed(0)
            : 'N/A';
          doc.fillColor(pct !== 'N/A' && parseFloat(pct) >= 75 ? '#059669' : '#dc2626').font('Times-Bold').fontSize(7.5)
            .text(pct === 'N/A' ? pct : `${pct}%`, curX, cursorY + 5, { width: overallColW, align: 'center' });
        }

        cursorY += rowH;
      });
    }

    // Close the table with a subtle bottom border for a "card" feel.
    doc.lineWidth(0.75).moveTo(tableM, cursorY).lineTo(tableM + tableW, cursorY).stroke('#ddd6fe');
  }

  for (let p = 0; p < doc.bufferedPageRange().count; p++) {
    doc.switchToPage(p);
    doc.fillColor('#b0a8c4').font('Times-Italic').fontSize(7.5)
      .text('This is a computer-generated attendance ledger and does not require a signature.', M, H - 25, { align: 'center', width: W - M * 2 });
  }
}

async function generateAttendanceLedgerPDF(data, res, disposition = 'inline') {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${disposition}; filename=attendance-ledger-${(data.rangeLabel || 'report').replace(/\s+/g, '-')}.pdf`);
  doc.pipe(res);
  await drawAttendanceLedger(doc, data);
  doc.end();
}

module.exports = { generateAttendanceLedgerPDF };
