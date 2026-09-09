const PDFDocument = require('pdfkit');
const axios = require('axios');

async function buildSalarySlipBuffer(data) {
  return new Promise(async (resolve, reject) => {
    const { teacher, month, year, amount, academicYear, transactionId } = data;
    const doc = new PDFDocument({ size: 'A5', margin: 0, bufferPages: true });
    const buffers = [];
    doc.on('data', chunk => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const W = doc.page.width;
    const H = doc.page.height;
    const M = 36;

    // Background
    doc.rect(0, 0, W, H).fill('#fafafa');

    // Watermark
    doc.save();
    doc.fillOpacity(0.03);
    doc.fillColor('#4b2d84').font('Times-Bold').fontSize(8);
    const wmText = 'TUITION HUB EDU CENTRE   ';
    for (let y = -20; y < H + 40; y += 60) {
      for (let x = -20; x < W + 40; x += 180) {
        doc.save(); doc.translate(x, y); doc.rotate(-30); doc.text(wmText, 0, 0); doc.restore();
      }
    }
    doc.restore();

    // Header gradient band
    const headerH = 110;
    const grad = doc.linearGradient(0, 0, W, headerH);
    grad.stop(0, '#4b2d84').stop(1, '#7c3aed');
    doc.rect(0, 0, W, headerH).fill(grad);
    doc.save(); doc.fillOpacity(0.08);
    doc.circle(W - 30, 30, 70).fill('white');
    doc.circle(W - 60, 90, 40).fill('white');
    doc.circle(30, 15, 55).fill('white');
    doc.restore();

    try {
      const logoUrl = process.env.CLOUDINARY_HEADER_URL;
      if (logoUrl) {
        const resp = await axios.get(logoUrl, { responseType: 'arraybuffer', timeout: 4000 });
        doc.image(Buffer.from(resp.data), M, 14, { fit: [W - M * 2, 48], align: 'center' });
      }
    } catch (_) {}

    doc.fillColor('white').font('Times-Bold').fontSize(9)
      .text('SALARY SLIP', 0, 68, { align: 'center', width: W, characterSpacing: 3 });
    doc.fillColor('#ddd6fe').font('Times-Roman').fontSize(8)
      .text('Academic Year ' + academicYear, 0, 82, { align: 'center', width: W });

    let cy = headerH + 18;

    // Month badge
    doc.roundedRect(M, cy, W - M * 2, 36, 8).fill('#ede9fe');
    doc.fillColor('#4b2d84').font('Times-Bold').fontSize(18)
      .text(month.toUpperCase() + ' ' + year, M, cy + 8, { align: 'center', width: W - M * 2 });
    cy += 52;

    // Employee details box
    doc.roundedRect(M, cy, W - M * 2, 72, 8).fillAndStroke('#ffffff', '#e5e7eb');
    doc.fillColor('#6b7280').font('Times-Roman').fontSize(8).text('EMPLOYEE NAME', M + 14, cy + 12, { characterSpacing: 1 });
    doc.fillColor('#111827').font('Times-Bold').fontSize(13).text(teacher.teacherName.toUpperCase(), M + 14, cy + 24);
    doc.fillColor('#6b7280').font('Times-Roman').fontSize(8).text('ROLE', M + 14, cy + 44, { characterSpacing: 1 });
    doc.fillColor('#4b2d84').font('Times-Bold').fontSize(9).text((teacher.role || 'TEACHER').toUpperCase(), M + 14, cy + 55);
    if (teacher.teacherId) {
      doc.fillColor('#6b7280').font('Times-Roman').fontSize(8).text('STAFF ID', W / 2 + 10, cy + 44, { characterSpacing: 1 });
      doc.fillColor('#111827').font('Times-Bold').fontSize(9).text(teacher.teacherId.toUpperCase(), W / 2 + 10, cy + 55);
    }
    cy += 86;

    // Amount box
    doc.roundedRect(M, cy, W - M * 2, 72, 8).fill('#4b2d84');
    doc.fillColor('#ddd6fe').font('Times-Roman').fontSize(8).text('SALARY CREDITED', M, cy + 12, { align: 'center', width: W - M * 2, characterSpacing: 2 });
    doc.fillColor('white').font('Times-Bold').fontSize(28).text('\u20B9' + Number(amount).toLocaleString('en-IN'), M, cy + 24, { align: 'center', width: W - M * 2 });
    doc.fillColor('#c4b5fd').font('Times-Roman').fontSize(7.5).text('Rupees ' + amountInWords(amount) + ' Only', M, cy + 57, { align: 'center', width: W - M * 2 });
    cy += 86;

    // Details row
    doc.moveTo(M, cy).lineTo(W - M, cy).strokeColor('#e5e7eb').lineWidth(1).stroke();
    cy += 14;
    const fields = [
      { label: 'TXN ID', value: transactionId ? String(transactionId).slice(-8).toUpperCase() : 'N/A' },
      { label: 'MODE', value: 'CASH / BANK' },
      { label: 'ISSUED BY', value: 'TUITION HUB' },
    ];
    const colW = (W - M * 2) / fields.length;
    fields.forEach((f, i) => {
      const x = M + i * colW;
      doc.fillColor('#9ca3af').font('Times-Roman').fontSize(7).text(f.label, x, cy, { width: colW, align: 'center', characterSpacing: 0.5 });
      doc.fillColor('#111827').font('Times-Bold').fontSize(8.5).text(f.value, x, cy + 12, { width: colW, align: 'center' });
    });
    cy += 36;

    doc.moveTo(M, cy).lineTo(W - M, cy).strokeColor('#e5e7eb').lineWidth(1).stroke();
    cy += 8;
    doc.fillColor('#9ca3af').font('Times-Roman').fontSize(7)
      .text('This is a computer-generated salary slip and does not require a signature.', M, cy, { align: 'center', width: W - M * 2 });

    doc.end();
  });
}

function amountInWords(num) {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const n = Math.floor(Number(num));
  if (n === 0) return 'Zero';
  if (n < 20) return ones[n];
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
  if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + amountInWords(n % 100) : '');
  if (n < 100000) return amountInWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + amountInWords(n % 1000) : '');
  if (n < 10000000) return amountInWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + amountInWords(n % 100000) : '');
  return amountInWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + amountInWords(n % 10000000) : '');
}

module.exports = { buildSalarySlipBuffer };
