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

    const W = doc.page.width;   // 419.53
    const H = doc.page.height;  // 595.28
    const M = 30;

    // ─── Full page background ───
    doc.rect(0, 0, W, H).fill('#FFFFFF');

    // ─── Top accent bar (thin) ───
    doc.rect(0, 0, W, 6).fill('#4b2d84');

    // ─── Header band ───
    const headerH = 100;
    doc.rect(0, 6, W, headerH).fill('#4b2d84');

    // Decorative circles
    doc.save();
    doc.fillOpacity(0.07);
    doc.circle(W - 20, 6, 90).fill('#a78bfa');
    doc.circle(30, 6 + headerH, 60).fill('#a78bfa');
    doc.restore();

    // Logo
    let logoLoaded = false;
    try {
      const logoUrl = process.env.CLOUDINARY_HEADER_URL;
      if (logoUrl) {
        const resp = await axios.get(logoUrl, { responseType: 'arraybuffer', timeout: 5000 });
        const logoBuf = Buffer.from(resp.data);
        doc.image(logoBuf, M, 14, { fit: [W - M * 2, 50], align: 'center' });
        logoLoaded = true;
      }
    } catch (_) {}

    if (!logoLoaded) {
      doc.fillColor('#7c3aed').font('Helvetica-Bold').fontSize(16)
        .text('TUITION HUB', M, 28, { align: 'center', width: W - M * 2 });
    }

    doc.fillColor('#ddd6fe').font('Helvetica').fontSize(7)
      .text('EDUCATION CENTRE', 0, 64, { align: 'center', width: W, characterSpacing: 3 });

    // ─── PAYSLIP label ribbon ───
    const ribbonY = 6 + headerH;
    doc.rect(0, ribbonY, W, 28).fill('#ede9fe');
    doc.fillColor('#4b2d84').font('Helvetica-Bold').fontSize(9)
      .text('SALARY SLIP', 0, ribbonY + 9, { align: 'center', width: W, characterSpacing: 4 });

    let cy = ribbonY + 42;

    // ─── Month badge ───
    const badgeW = 220;
    const badgeX = (W - badgeW) / 2;
    doc.roundedRect(badgeX, cy, badgeW, 32, 6).fill('#4b2d84');
    doc.fillColor('white').font('Helvetica-Bold').fontSize(15)
      .text(`${month.toUpperCase()} ${year}`, badgeX, cy + 9, { width: badgeW, align: 'center' });
    cy += 46;

    // ─── Academic year tag ───
    doc.fillColor('#9ca3af').font('Helvetica').fontSize(7.5)
      .text(`Academic Year: ${academicYear}`, 0, cy, { align: 'center', width: W });
    cy += 20;

    // ─── Divider ───
    doc.moveTo(M, cy).lineTo(W - M, cy).lineWidth(0.5).strokeColor('#e5e7eb').stroke();
    cy += 16;

    // ─── Employee info ───
    // Left col
    doc.fillColor('#9ca3af').font('Helvetica').fontSize(7).text('EMPLOYEE NAME', M, cy, { characterSpacing: 1 });
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(12).text(teacher.teacherName.toUpperCase(), M, cy + 11);

    // Right col
    doc.fillColor('#9ca3af').font('Helvetica').fontSize(7).text('DESIGNATION', W / 2 + 10, cy, { characterSpacing: 1 });
    doc.fillColor('#4b2d84').font('Helvetica-Bold').fontSize(10).text((teacher.role || 'TEACHER').toUpperCase(), W / 2 + 10, cy + 11);

    cy += 36;

    // Staff ID row
    doc.fillColor('#9ca3af').font('Helvetica').fontSize(7).text('STAFF ID', M, cy, { characterSpacing: 1 });
    doc.fillColor('#374151').font('Helvetica-Bold').fontSize(9).text(teacher.teacherId ? teacher.teacherId.toUpperCase() : 'N/A', M, cy + 11);

    if (transactionId) {
      doc.fillColor('#9ca3af').font('Helvetica').fontSize(7).text('TRANSACTION REF', W / 2 + 10, cy, { characterSpacing: 1 });
      doc.fillColor('#374151').font('Helvetica-Bold').fontSize(9).text(String(transactionId).slice(-8).toUpperCase(), W / 2 + 10, cy + 11);
    }

    cy += 34;

    // ─── Divider ───
    doc.moveTo(M, cy).lineTo(W - M, cy).lineWidth(0.5).strokeColor('#e5e7eb').stroke();
    cy += 20;

    // ─── Amount section ───
    const amtBoxW = W - M * 2;
    const amtBoxH = 80;
    doc.roundedRect(M, cy, amtBoxW, amtBoxH, 10).fill('#f5f3ff');
    doc.roundedRect(M, cy, amtBoxW, amtBoxH, 10).lineWidth(1).strokeColor('#ddd6fe').stroke();

    // Left stripe
    doc.roundedRect(M, cy, 5, amtBoxH, 3).fill('#4b2d84');

    doc.fillColor('#6b7280').font('Helvetica').fontSize(7.5)
      .text('SALARY CREDITED', M + 20, cy + 14, { characterSpacing: 2 });

    // Amount — use Rs. instead of ₹ unicode
    const amtStr = `Rs. ${Number(amount).toLocaleString('en-IN')}`;
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(26)
      .text(amtStr, M + 20, cy + 26);

    doc.fillColor('#9ca3af').font('Helvetica').fontSize(7.5)
      .text(amountInWords(amount) + ' Rupees Only', M + 20, cy + 57);

    cy += amtBoxH + 20;

    // ─── Payment details row ───
    const cols = [
      { label: 'PAYMENT MODE', value: 'CASH / BANK' },
      { label: 'ISSUED BY', value: 'TUITION HUB EDU CTR.' },
      { label: 'DATE', value: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) },
    ];

    const colW2 = amtBoxW / cols.length;
    doc.roundedRect(M, cy, amtBoxW, 40, 6).fill('#f9fafb');
    cols.forEach((col, i) => {
      const x = M + i * colW2;
      if (i > 0) doc.moveTo(x, cy + 8).lineTo(x, cy + 32).lineWidth(0.5).strokeColor('#e5e7eb').stroke();
      doc.fillColor('#9ca3af').font('Helvetica').fontSize(6.5).text(col.label, x + 4, cy + 10, { width: colW2 - 8, align: 'center', characterSpacing: 0.5 });
      doc.fillColor('#374151').font('Helvetica-Bold').fontSize(8).text(col.value, x + 4, cy + 22, { width: colW2 - 8, align: 'center' });
    });
    cy += 56;

    // ─── Authorized signature line ───
    const sigX = W - M - 110;
    doc.moveTo(sigX, cy).lineTo(W - M, cy).lineWidth(0.5).strokeColor('#d1d5db').stroke();
    doc.fillColor('#9ca3af').font('Helvetica').fontSize(7)
      .text('Authorized Signatory', sigX - 10, cy + 4, { width: 120, align: 'center' });

    cy += 24;

    // ─── Footer ───
    doc.moveTo(M, cy).lineTo(W - M, cy).lineWidth(0.5).strokeColor('#e5e7eb').stroke();
    cy += 8;
    doc.fillColor('#d1d5db').font('Helvetica').fontSize(6.5)
      .text('This is a computer-generated document. No signature required.', M, cy, { align: 'center', width: W - M * 2 });

    // ─── Bottom accent bar ───
    doc.rect(0, H - 6, W, 6).fill('#4b2d84');

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
