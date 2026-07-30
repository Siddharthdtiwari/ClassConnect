const PDFDocument = require('pdfkit');
const axios = require('axios');

async function drawFeeDefaultersReport(doc, data) {
  const { defaulters, monthData, effectiveMonths, selectedYearStr, reportTitle } = data;
  const W = doc.page.width;
  const H = doc.page.height;
  const M = 40;

  function drawWatermark() {
    doc.save();
    doc.fillOpacity(0.06);
    doc.fillColor("#4b2d84");
    doc.font("Times-Bold").fontSize(10);

    const watermarkText = `TUITION HUB EDU CENTER - FEE DEFAULTERS    `;
    const stepX = 180;
    const stepY = 80;

    for (let y = -50; y < doc.page.height + 100; y += stepY) {
      for (let x = -50; x < doc.page.width + 100; x += stepX) {
        doc.save();
        doc.translate(x, y);
        doc.rotate(-30);
        doc.text(watermarkText, 0, 0);
        doc.restore();
      }
    }
    doc.restore();
  }

  doc.rect(0, 0, W, H).fill("#fafafa");
  drawWatermark();

  const primaryGrad = doc.linearGradient(0, 0, W, 120);
  primaryGrad.stop(0, "#4b2d84").stop(1, "#6b46c1");

  // Header
  let headerHeight = 150;
  doc.rect(0, 0, W, headerHeight).fill(primaryGrad);

  doc.save();
  doc.fillOpacity(0.1);
  doc.circle(W - 40, 40, 80).fill("white");
  doc.circle(W - 80, 100, 50).fill("white");
  doc.circle(40, 20, 60).fill("white");
  doc.restore();

  const headerUrl = process.env.CLOUDINARY_HEADER_URL;
  if (headerUrl) {
    try {
      const response = await axios.get(headerUrl, { responseType: "arraybuffer" });
      const imgBuffer = Buffer.from(response.data, "binary");
      doc.image(imgBuffer, M, 20, { fit: [W - 2 * M, 80], align: 'center' });
    } catch (_) {
      // Fallback
    }
  }

  const finalTitle = reportTitle || "FEE DEFAULTERS REPORT";

  doc.fillColor("white").font("Times-Bold").fontSize(20)
    .text(finalTitle.toUpperCase(), M, 110, { align: "left", characterSpacing: 1 });

  doc.fillColor("white").font("Times-Bold").fontSize(10)
    .text(`Academic Year: ${selectedYearStr}`, W - M - 150, 115, { align: "right", width: 150 });
  doc.fillColor("#e9d5ff").font("Times-Bold").fontSize(10)
    .text(`Date: ${new Date().toLocaleDateString('en-IN')}`, W - M - 150, 130, { align: "right", width: 150 });

  let cursorY = headerHeight + 30;

  function checkPageAdd(heightNeeded) {
    if (cursorY + heightNeeded > doc.page.height - 60) {
      doc.addPage();
      doc.rect(0, 0, W, doc.page.height).fill("#fafafa");
      drawWatermark();

      doc.rect(0, 0, W, 40).fill(primaryGrad);
      doc.fillColor("white").font("Times-Bold").fontSize(12)
        .text(finalTitle.toUpperCase(), M, 13);
      doc.fillColor("#e9d5ff").font("Times-Roman").fontSize(10)
        .text(selectedYearStr, W - M - 200, 15, { align: "right", width: 200 });
      cursorY = 70;
    }
  }

  function drawTableHeader(title, columns, widths) {
    checkPageAdd(60);

    doc.fillColor("#4b2d84").font("Times-Bold").fontSize(12)
      .text(title.toUpperCase(), M, cursorY, { characterSpacing: 1 });
    cursorY += 20;

    doc.roundedRect(M, cursorY, W - 2*M, 25, 4).fill("#ede9fe");

    doc.fillColor("#4b2d84").font("Times-Bold").fontSize(9);
    let curX = M + 15;
    columns.forEach((col, i) => {
      doc.text(col.toUpperCase(), curX, cursorY + 8, { width: widths[i], characterSpacing: 0.5 });
      curX += widths[i];
    });
    cursorY += 25;
  }

  const noDefaulters = (!defaulters || defaulters.length === 0);
  const noMonthData = (!effectiveMonths || effectiveMonths.length === 0);

  if (noDefaulters && noMonthData) {
    doc.fillColor("#111827").font("Times-Italic").fontSize(12).text("No fee defaulters found for this period filter.", M, cursorY);
    writeFooter();
    return;
  }

  const cardW = W - 2 * M;

  // Batch-wise Breakdown
  if (defaulters && defaulters.length > 0) {
    const batchCols = ["Student ID", "Student Name", "Mobile", "Unpaid Months", "Balance"];
    const batchWidths = [80, 150, 80, 120, 80];

    const byClass = {};
    defaulters.forEach(d => {
      if (!byClass[d.standard]) byClass[d.standard] = [];
      byClass[d.standard].push(d);
    });

    const getBatchOrderValue = (name) => {
      if (!name) return 999;
      const lowerName = name.toLowerCase();
      if (lowerName.includes("pre") || lowerName.includes("kg")) return 0;
      const match = lowerName.match(/^(\d+)/);
      if (match) return parseInt(match[1]);
      return 100;
    };
    const sortedClasses = Object.keys(byClass).sort((a, b) => getBatchOrderValue(a) - getBatchOrderValue(b));

    for (const cls of sortedClasses) {
      drawTableHeader(`Batch ${cls} Defaulters`, batchCols, batchWidths);

      for (const [i, r] of byClass[cls].entries()) {
        checkPageAdd(25);
        const isEven = i % 2 === 0;
        doc.rect(M, cursorY, cardW, 25).fill(isEven ? "white" : "#f3f4f6");
        doc.rect(M, cursorY + 25, cardW, 1).fill("#e5e7eb");

        let curX = M + 15;
        doc.fillColor("#6b7280").font("Times-Roman").fontSize(9)
          .text(r.studentId, curX, cursorY + 8, { width: batchWidths[0] });
        curX += batchWidths[0];

        // Draw profile image or fallback initial circle
        const imgSize = 14;
        const imgX = curX + 2;
        const imgY = cursorY + 5.5;
        let hasImage = false;
        
        if (r.profilePhoto) {
          try {
            let imgBuffer = null;
            if (r.profilePhoto.startsWith("http://") || r.profilePhoto.startsWith("https://")) {
              const imgResponse = await axios.get(r.profilePhoto, { responseType: 'arraybuffer', timeout: 3000 });
              imgBuffer = Buffer.from(imgResponse.data, 'binary');
            } else {
              const path = require("path");
              const fs = require("fs");
              const localPath = path.join(__dirname, "..", "public", r.profilePhoto);
              if (fs.existsSync(localPath)) {
                imgBuffer = fs.readFileSync(localPath);
              }
            }

            if (imgBuffer) {
              let imageDrawn = false;
              doc.save();
              try {
                doc.circle(imgX + imgSize/2, imgY + imgSize/2, imgSize/2).clip();
                doc.image(imgBuffer, imgX, imgY, { width: imgSize, height: imgSize });
                imageDrawn = true;
              } catch (imgErr) {
                console.error("PDFKit image rendering error in batch defaults:", imgErr);
              }
              doc.restore();
              
              if (imageDrawn) {
                doc.circle(imgX + imgSize/2, imgY + imgSize/2, imgSize/2).lineWidth(0.5).stroke("#4b2d84");
                hasImage = true;
              }
            }
          } catch (err) {
            console.error("Failed to load profile photo in batch defaults report:", err);
          }
        }

        if (!hasImage) {
          doc.save();
          doc.fillColor("#ede9fe");
          doc.circle(imgX + imgSize/2, imgY + imgSize/2, imgSize/2).fill();
          
          doc.fillColor("#4b2d84").font("Times-Bold").fontSize(7);
          const firstLetter = r.studentName ? r.studentName.charAt(0).toUpperCase() : '?';
          doc.text(firstLetter, imgX, imgY + 3.5, { width: imgSize, align: 'center' });
          doc.restore();
        }

        doc.fillColor("#111827").font("Times-Bold").fontSize(9)
          .text(r.studentName, curX + 22, cursorY + 8, { width: batchWidths[1] - 22 });
        curX += batchWidths[1];

        doc.fillColor("#4b5563").font("Times-Roman").fontSize(9)
          .text(r.mobileNo || '-', curX, cursorY + 8, { width: batchWidths[2] });
        curX += batchWidths[2];

        doc.fillColor("#d97706").font("Times-Bold").fontSize(8)
          .text(r.unpaidMonths.join(', '), curX, cursorY + 8, { width: batchWidths[3] });
        curX += batchWidths[3];

        doc.fillColor("#dc2626").font("Times-Bold").fontSize(9)
          .text(`Rs. ${r.balance.toLocaleString("en-IN")}`, curX, cursorY + 8, { width: batchWidths[4] });

        cursorY += 25;
      }
      cursorY += 15;
    }
  }

  // Monthly Breakdown
  const monthCols = ["Batch", "Student ID", "Student Name", "Amount Due"];
  const monthWidths = [100, 100, 180, 100];

  if (effectiveMonths && monthData) {
    for (const month of effectiveMonths) {
      if (!monthData[month] || monthData[month].length === 0) continue;
      
      drawTableHeader(`Defaulters - ${month}`, monthCols, monthWidths);
      
      for (const [i, r] of monthData[month].entries()) {
        checkPageAdd(25);
        const isEven = i % 2 === 0;
        doc.rect(M, cursorY, cardW, 25).fill(isEven ? "white" : "#f3f4f6");
        doc.rect(M, cursorY + 25, cardW, 1).fill("#e5e7eb");

        let curX = M + 15;
        doc.fillColor("#111827").font("Times-Bold").fontSize(9)
          .text(r.standard, curX, cursorY + 8, { width: monthWidths[0] });
        curX += monthWidths[0];
        
        doc.fillColor("#6b7280").font("Times-Roman").fontSize(9)
          .text(r.studentId, curX, cursorY + 8, { width: monthWidths[1] });
        curX += monthWidths[1];

        // Draw profile image or fallback initial circle
        const imgSize = 14;
        const imgX = curX + 2;
        const imgY = cursorY + 5.5;
        let hasImage = false;
        
        if (r.profilePhoto) {
          try {
            let imgBuffer = null;
            if (r.profilePhoto.startsWith("http://") || r.profilePhoto.startsWith("https://")) {
              const imgResponse = await axios.get(r.profilePhoto, { responseType: 'arraybuffer', timeout: 3000 });
              imgBuffer = Buffer.from(imgResponse.data, 'binary');
            } else {
              const path = require("path");
              const fs = require("fs");
              const localPath = path.join(__dirname, "..", "public", r.profilePhoto);
              if (fs.existsSync(localPath)) {
                imgBuffer = fs.readFileSync(localPath);
              }
            }

            if (imgBuffer) {
              let imageDrawn = false;
              doc.save();
              try {
                doc.circle(imgX + imgSize/2, imgY + imgSize/2, imgSize/2).clip();
                doc.image(imgBuffer, imgX, imgY, { width: imgSize, height: imgSize });
                imageDrawn = true;
              } catch (imgErr) {
                console.error("PDFKit image rendering error in monthly defaults:", imgErr);
              }
              doc.restore();
              
              if (imageDrawn) {
                doc.circle(imgX + imgSize/2, imgY + imgSize/2, imgSize/2).lineWidth(0.5).stroke("#4b2d84");
                hasImage = true;
              }
            }
          } catch (err) {
            console.error("Failed to load profile photo in monthly defaults report:", err);
          }
        }

        if (!hasImage) {
          doc.save();
          doc.fillColor("#ede9fe");
          doc.circle(imgX + imgSize/2, imgY + imgSize/2, imgSize/2).fill();
          
          doc.fillColor("#4b2d84").font("Times-Bold").fontSize(7);
          const firstLetter = r.studentName ? r.studentName.charAt(0).toUpperCase() : '?';
          doc.text(firstLetter, imgX, imgY + 3.5, { width: imgSize, align: 'center' });
          doc.restore();
        }

        doc.fillColor("#111827").font("Times-Bold").fontSize(9)
          .text(r.studentName, curX + 22, cursorY + 8, { width: monthWidths[2] - 22 });
        curX += monthWidths[2];

        doc.fillColor("#dc2626").font("Times-Bold").fontSize(9)
          .text(`Rs. ${r.balance.toLocaleString("en-IN")}`, curX, cursorY + 8, { width: monthWidths[3] });
        
        cursorY += 25;
      }
      cursorY += 15;
    }
  }

  // Footer
  function writeFooter() {
    for (let p = 0; p < doc.bufferedPageRange().count; p++) {
      doc.switchToPage(p);
      doc.rect(0, doc.page.height - 50, W, 2).fill('#e9d5ff');
      doc.fillColor('#9ca3af').font('Times-Italic').fontSize(9)
    .text('This is a computer-generated report and does not require a signature.', M, doc.page.height - 40, { align: 'center', width: W - M * 2, continued: true })
    .fillColor('#4b2d84').text(' | Powered by ClassConnect', { link: 'https://classconnects.vercel.app' });
    }
  }

  writeFooter();
}

async function drawAttendanceDefaultersReport(doc, data) {
  const { defaulters, month, year } = data;
  const W = doc.page.width;
  const H = doc.page.height;
  const M = 40;

  function drawWatermark() {
    doc.save();
    doc.fillOpacity(0.06);
    doc.fillColor("#4b2d84");
    doc.font("Times-Bold").fontSize(10);

    const watermarkText = `TUITION HUB EDU CENTER - ATTENDANCE DEFAULTERS    `;
    const stepX = 180;
    const stepY = 80;

    for (let y = -50; y < doc.page.height + 100; y += stepY) {
      for (let x = -50; x < doc.page.width + 100; x += stepX) {
        doc.save();
        doc.translate(x, y);
        doc.rotate(-30);
        doc.text(watermarkText, 0, 0);
        doc.restore();
      }
    }
    doc.restore();
  }

  doc.rect(0, 0, W, H).fill("#fafafa");
  drawWatermark();

  const primaryGrad = doc.linearGradient(0, 0, W, 120);
  primaryGrad.stop(0, "#4b2d84").stop(1, "#6b46c1");

  // Header
  let headerHeight = 150;
  doc.rect(0, 0, W, headerHeight).fill(primaryGrad);

  doc.save();
  doc.fillOpacity(0.1);
  doc.circle(W - 40, 40, 80).fill("white");
  doc.circle(W - 80, 100, 50).fill("white");
  doc.circle(40, 20, 60).fill("white");
  doc.restore();

  const headerUrl = process.env.CLOUDINARY_HEADER_URL;
  if (headerUrl) {
    try {
      const response = await axios.get(headerUrl, { responseType: "arraybuffer" });
      const imgBuffer = Buffer.from(response.data, "binary");
      doc.image(imgBuffer, M, 20, { fit: [W - 2 * M, 80], align: 'center' });
    } catch (_) {
      // Fallback
    }
  }

  const printMonthName = new Date(year, parseInt(month) - 1).toLocaleString('default', { month: 'long' });

  doc.fillColor("white").font("Times-Bold").fontSize(20)
    .text("ATTENDANCE DEFAULTERS", M, 110, { align: "left", characterSpacing: 1 });

  doc.fillColor("white").font("Times-Bold").fontSize(10)
    .text(`Period: ${printMonthName} ${year}`, W - M - 150, 115, { align: "right", width: 150 });
  doc.fillColor("#e9d5ff").font("Times-Bold").fontSize(10)
    .text(`Date: ${new Date().toLocaleDateString('en-IN')}`, W - M - 150, 130, { align: "right", width: 150 });

  let cursorY = headerHeight + 30;

  function checkPageAdd(heightNeeded) {
    if (cursorY + heightNeeded > doc.page.height - 60) {
      doc.addPage();
      doc.rect(0, 0, W, doc.page.height).fill("#fafafa");
      drawWatermark();

      doc.rect(0, 0, W, 40).fill(primaryGrad);
      doc.fillColor("white").font("Times-Bold").fontSize(12)
        .text("ATTENDANCE DEFAULTERS", M, 13);
      doc.fillColor("#e9d5ff").font("Times-Roman").fontSize(10)
        .text(`${printMonthName} ${year}`, W - M - 200, 15, { align: "right", width: 200 });
      cursorY = 70;
    }
  }

  function drawTableHeader(title, columns, widths) {
    checkPageAdd(60);

    doc.fillColor("#4b2d84").font("Times-Bold").fontSize(12)
      .text(title.toUpperCase(), M, cursorY, { characterSpacing: 1 });
    cursorY += 20;

    doc.roundedRect(M, cursorY, W - 2*M, 25, 4).fill("#ede9fe");

    doc.fillColor("#4b2d84").font("Times-Bold").fontSize(9);
    let curX = M + 15;
    columns.forEach((col, i) => {
      doc.text(col.toUpperCase(), curX, cursorY + 8, { width: widths[i], characterSpacing: 0.5 });
      curX += widths[i];
    });
    cursorY += 25;
  }

  const cardW = W - 2 * M;

  if (!defaulters || defaulters.length === 0) {
    doc.fillColor("#111827").font("Times-Italic").fontSize(12).text("No attendance defaulters found for this month.", M, cursorY);
    writeFooter();
    return;
  }

  const cols = ["Student ID", "Name", "Batch", "Phone", "P/A", "Attendance %"];
  const widths = [70, 130, 80, 90, 60, 80];

  drawTableHeader("Students Below 75% Attendance", cols, widths);

  defaulters.forEach((r, i) => {
    checkPageAdd(25);
    const isEven = i % 2 === 0;
    doc.rect(M, cursorY, cardW, 25).fill(isEven ? "white" : "#f3f4f6");
    doc.rect(M, cursorY + 25, cardW, 1).fill("#e5e7eb");

    let curX = M + 15;
    
    // ID
    doc.fillColor("#6b7280").font("Times-Roman").fontSize(9)
      .text(r.studentId, curX, cursorY + 8, { width: widths[0] });
    curX += widths[0];

    // Name
    doc.fillColor("#111827").font("Times-Bold").fontSize(9)
      .text(r.studentName, curX, cursorY + 8, { width: widths[1] });
    curX += widths[1];

    // Batch
    doc.fillColor("#111827").font("Times-Bold").fontSize(9)
      .text(r.standard, curX, cursorY + 8, { width: widths[2] });
    curX += widths[2];

    // Phone
    doc.fillColor("#4b5563").font("Times-Roman").fontSize(9)
      .text(r.mobileNo || '-', curX, cursorY + 8, { width: widths[3] });
    curX += widths[3];

    // P/A
    doc.fillColor("#4b5563").font("Times-Roman").fontSize(9)
      .text(`${r.present}/${r.total}`, curX, cursorY + 8, { width: widths[4] });
    curX += widths[4];

    // Attendance %
    const percentage = r.total > 0 ? ((r.present / r.total) * 100).toFixed(2) : 0;
    const danger = percentage < 50;
    doc.fillColor(danger ? "#dc2626" : "#d97706").font("Times-Bold").fontSize(9)
      .text(`${percentage}%`, curX, cursorY + 8, { width: widths[5] });

    cursorY += 25;
  });

  function writeFooter() {
    for (let p = 0; p < doc.bufferedPageRange().count; p++) {
      doc.switchToPage(p);
      doc.rect(0, doc.page.height - 50, W, 2).fill('#e9d5ff');
      doc.fillColor('#9ca3af').font('Times-Italic').fontSize(9)
    .text('This is a computer-generated report and does not require a signature.', M, doc.page.height - 40, { align: 'center', width: W - M * 2, continued: true })
    .fillColor('#4b2d84').text(' | Powered by ClassConnect', { link: 'https://classconnects.vercel.app' });
    }
  }

  writeFooter();
}

async function generateAttendanceDefaultersPDF(data, res, disposition = 'inline') {
  const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', disposition + `; filename=attendance-defaulters-${data.month}-${data.year}.pdf`);
  doc.pipe(res);
  await drawAttendanceDefaultersReport(doc, data);
  doc.end();
}

async function generateFeeDefaultersPDF(data, res, disposition = 'inline') {
  const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', disposition + `; filename=fee-defaulters-${data.selectedYearStr}.pdf`);
  doc.pipe(res);
  await drawFeeDefaultersReport(doc, data);
  doc.end();
}


module.exports = { drawFeeDefaultersReport, drawAttendanceDefaultersReport, generateAttendanceDefaultersPDF, generateFeeDefaultersPDF };
