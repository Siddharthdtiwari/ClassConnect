const PDFDocument = require('pdfkit');
const axios = require('axios');

async function drawFeeSummaryReport(doc, student, feesByMonth, totalDue) {
  const W = doc.page.width;
  const H = doc.page.height;
  const M = 40;

  function drawWatermark() {
    doc.save();
    doc.fillOpacity(0.06);
    doc.fillColor('#4b2d84');
    doc.font('Times-Bold').fontSize(10);

    const watermarkText = `TUITION HUB EDU CENTER - ${student.studentName.toUpperCase()} FEE SUMMARY    `;
    const stepX = 180;
    const stepY = 80;

    for (let y = -50; y < H + 100; y += stepY) {
      for (let x = -50; x < W + 100; x += stepX) {
        doc.save();
        doc.translate(x, y);
        doc.rotate(-30);
        doc.text(watermarkText, 0, 0);
        doc.restore();
      }
    }
    doc.restore();
  }

  doc.rect(0, 0, W, H).fill('#fafafa');
  drawWatermark();

  const primaryGrad = doc.linearGradient(0, 0, W, 120);
  primaryGrad.stop(0, '#4b2d84').stop(1, '#6b46c1');

  let headerHeight = 150;
  doc.rect(0, 0, W, headerHeight).fill(primaryGrad);

  doc.save();
  doc.fillOpacity(0.1);
  doc.circle(W - 40, 40, 80).fill('white');
  doc.circle(W - 80, 100, 50).fill('white');
  doc.circle(40, 20, 60).fill('white');
  doc.restore();

  const headerUrl = process.env.CLOUDINARY_HEADER_URL;
  if (headerUrl) {
    try {
      const response = await axios.get(headerUrl, { responseType: "arraybuffer" });
      const imgBuffer = Buffer.from(response.data, "binary");
      doc.image(imgBuffer, M, 18, { fit: [W - 2 * M, 70], align: "center" });
    } catch (_) {
      // Fallback to text
    }
  }

  doc.fillColor('white').font('Times-Bold').fontSize(24)
    .text('FEE SUMMARY', M, 110, { align: 'left', characterSpacing: 1 });

  doc.fillColor('white').font('Times-Bold').fontSize(10)
    .text(`Date: ${new Date().toLocaleDateString('en-IN')}`, W - M - 150, 115, { align: 'right', width: 150 });
  doc.fillColor('#e9d5ff').font('Times-Bold').fontSize(10)
    .text(`Student ID: ${student.studentId}`, W - M - 150, 130, { align: 'right', width: 150 });

  let cursorY = headerHeight + 30;

  const cardW = W - 2 * M;
  doc.roundedRect(M, cursorY, cardW, 90, 8).fill('white').stroke('#e5e7eb');
  doc.save();
  doc.roundedRect(M, cursorY, cardW, 90, 8).clip();
  doc.rect(M, cursorY, 6, 90).fill('#bde045');
  doc.restore();

  doc.fillColor('#4b2d84').font('Times-Bold').fontSize(11)
    .text('STUDENT PROFILE', M + 25, cursorY + 15, { characterSpacing: 1 });
  doc.fillColor('#111827').font('Times-Bold').fontSize(22)
    .text(student.studentName, M + 25, cursorY + 35);

  const col1 = M + 25;
  const col2 = M + 160;
  const col3 = M + 295;

  doc.fontSize(10);
  const dataY = cursorY + 60;
  doc.fillColor('#6b7280').font('Times-Roman').text('Batch', col1, dataY)
    .fillColor('#111827').font('Times-Bold').text(student.batch ? student.batch.name : 'Unassigned', col1, dataY + 15);
  doc.fillColor('#6b7280').font('Times-Roman').text('Monthly Fee', col2, dataY)
    .fillColor('#111827').font('Times-Bold').text(`Rs. ${(student.monthlyFee || 0).toLocaleString('en-IN')}`, col2, dataY + 15);
  doc.fillColor('#6b7280').font('Times-Roman').text('Total Outstanding', col3, dataY)
    .fillColor(totalDue > 0 ? '#dc2626' : '#059669').font('Times-Bold').text(`Rs. ${totalDue.toLocaleString('en-IN')}`, col3, dataY + 15);

  cursorY += 120;

  doc.fillColor('#4b2d84').font('Times-Bold').fontSize(12)
    .text('FEE PAYMENT HISTORY', M, cursorY, { characterSpacing: 1 });
  cursorY += 20;

  doc.roundedRect(M, cursorY, cardW, 25, 4).fill('#ede9fe');
  const feeCols = ['For Month', 'Status', 'Date Paid', 'Amount'];
  const feeWidths = [120, 100, 130, 100];
  
  doc.fillColor('#4b2d84').font('Times-Bold').fontSize(9);
  let curX = M + 15;
  feeCols.forEach((col, i) => {
    doc.text(col.toUpperCase(), curX, cursorY + 8, { width: feeWidths[i] });
    curX += feeWidths[i];
  });
  cursorY += 25;

  feesByMonth.forEach((item, i) => {
    if (cursorY + 30 > H - 50) {
      doc.addPage();
      doc.rect(0, 0, W, H).fill('#fafafa');
      drawWatermark();
      doc.rect(0, 0, W, 40).fill(primaryGrad);
      doc.fillColor('white').font('Times-Bold').fontSize(14).text('FEE SUMMARY', M, 13);
      doc.fillColor('#e9d5ff').font('Times-Roman').fontSize(10).text(student.studentName, W - M - 200, 15, { align: 'right', width: 200 });
      cursorY = 70;
    }

    const isEven = i % 2 === 0;
    doc.rect(M, cursorY, cardW, 25).fill(isEven ? 'white' : '#f3f4f6');
    doc.rect(M, cursorY + 25, cardW, 0.5).fill('#e5e7eb');

    curX = M + 15;
    doc.fillColor('#111827').font('Times-Bold').fontSize(9).text(item.month, curX, cursorY + 8, { width: feeWidths[0] });
    curX += feeWidths[0];

    if (item.status === 'Paid') {
      doc.roundedRect(curX, cursorY + 5, 40, 15, 6).fill('#d1fae5');
      doc.fillColor('#065f46').fontSize(8).text('PAID', curX, cursorY + 9, { width: 40, align: 'center' });
    } else if (item.status === 'Due') {
      doc.roundedRect(curX, cursorY + 5, 40, 15, 6).fill('#fee2e2');
      doc.fillColor('#991b1b').fontSize(8).text('DUE', curX, cursorY + 9, { width: 40, align: 'center' });
    } else if (item.status === 'N/A') {
      doc.roundedRect(curX, cursorY + 5, 40, 15, 6).fill('#f3f4f6');
      doc.fillColor('#9ca3af').fontSize(8).text('N/A', curX, cursorY + 9, { width: 40, align: 'center' });
    } else {
      doc.roundedRect(curX, cursorY + 5, 60, 15, 6).fill('#f3f4f6');
      doc.fillColor('#4b5563').fontSize(8).text('UPCOMING', curX, cursorY + 9, { width: 60, align: 'center' });
    }
    curX += feeWidths[1];

    doc.fillColor('#4b5563').font('Times-Roman').fontSize(9);
    // The "Date Paid" column carries the N/A reason instead — there is no date to show.
    const middleText = item.status === 'N/A'
      ? (item.reason || '-')
      : (item.datePaid ? new Date(item.datePaid).toLocaleDateString('en-IN') : '-');
    doc.text(middleText, curX, cursorY + 8, { width: feeWidths[2], height: 12, ellipsis: true });
    curX += feeWidths[2];

    doc.fillColor('#4b2d84').font('Times-Bold');
    doc.text(item.status === 'N/A' ? '-' : `Rs. ${Number(item.amount).toLocaleString('en-IN')}`, curX, cursorY + 8, { width: feeWidths[3] });

    cursorY += 25;
  });

  for (let p = 0; p < doc.bufferedPageRange().count; p++) {
    doc.switchToPage(p);
    doc.rect(0, H - 50, W, 2).fill('#e9d5ff');
    doc.fillColor('#9ca3af').font('Times-Italic').fontSize(9)
      .text('This is a computer-generated report and does not require a signature.', M, H - 40, { align: 'center', width: W - M * 2 });
  }
}

async function generateFeeSummaryPDF(student, feesByMonth, totalDue, res, disposition = 'inline') {
  const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', disposition + `; filename=fee-summary-${student.studentId}.pdf`);
  doc.pipe(res);
  await drawFeeSummaryReport(doc, student, feesByMonth, totalDue);
  doc.end();
}


module.exports = { drawFeeSummaryReport, generateFeeSummaryPDF };
