const PDFDocument = require('pdfkit');
const axios = require('axios');

async function drawStudentReport(doc, student, stats) {
  const W = doc.page.width;
  const H = doc.page.height;
  const M = 40;

  function drawWatermark() {
    doc.save();
    doc.fillOpacity(0.1);
    doc.fillColor("#4b2d84");
    doc.font("Times-Bold").fontSize(10);

    const watermarkText = `TUITION HUB EDU CENTER - ${student.studentName.toUpperCase()} (${student.studentId})    `;
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

  // Background color for the whole page
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
      console.error("Header image failed to load");
    }
  }

  // Header Text - placed cleanly below the image area
  doc.fillColor("white").font("Times-Bold").fontSize(24)
    .text("STUDENT REPORT", M, 110, { align: "left", characterSpacing: 1 });

  doc.fillColor("white").font("Times-Bold").fontSize(10)
    .text(`Date: ${new Date().toLocaleDateString('en-IN')}`, W - M - 150, 115, { align: "right", width: 150 });
  doc.fillColor("#e9d5ff").font("Times-Bold").fontSize(10)
    .text(`Student ID: ${student.studentId}`, W - M - 150, 130, { align: "right", width: 150 });

  let cursorY = headerHeight + 30;

  // Student Profile Card
  const cardW = W - 2 * M;
  doc.roundedRect(M, cursorY, cardW, 110, 8).fill("white");
  doc.roundedRect(M, cursorY, cardW, 110, 8).stroke("#e5e7eb");

  doc.save();
  doc.roundedRect(M, cursorY, cardW, 110, 8).clip();
  doc.rect(M, cursorY, 6, 110).fill("#bde045");
  doc.restore();

  doc.fillColor("#4b2d84").font("Times-Bold").fontSize(11)
    .text("STUDENT PROFILE", M + 25, cursorY + 15, { characterSpacing: 1 });

  doc.fillColor("#111827").font("Times-Bold").fontSize(22)
    .text(student.studentName, M + 25, cursorY + 35);

  // Data items with small icons
  const dataY = cursorY + 65;
  doc.fontSize(10);

  const col1 = M + 25;
  const col2 = M + 125;
  const col3 = M + 230;
  const col4 = M + 335;

  doc.fillColor("#6b7280").font("Times-Roman").text("Batch", col1, dataY)
    .fillColor("#111827").font("Times-Bold").text(`Grade ${student.batch?.name || 'Unassigned'}`, col1, dataY + 15);

  doc.fillColor("#6b7280").font("Times-Roman").text("Mobile No", col2, dataY)
    .fillColor("#111827").font("Times-Bold").text(`+91 ${student.mobileNo}`, col2, dataY + 15);

  doc.fillColor("#6b7280").font("Times-Roman").text("Class Rank", col3, dataY)
    .fillColor("#d97706").font("Times-Bold").text(`Rank #${stats.studentRank}`, col3, dataY + 15);

  doc.fillColor("#6b7280").font("Times-Roman").text("Reward Points", col4, dataY)
    .fillColor("#10b981").font("Times-Bold").text(`${Math.trunc(student.points || 0)} Points`, col4, dataY + 15);

  if (student.profilePhoto) {
    try {
      let imgBuffer = null;
      if (student.profilePhoto.startsWith("http://") || student.profilePhoto.startsWith("https://")) {
        const imgResponse = await axios.get(student.profilePhoto, { responseType: 'arraybuffer' });
        imgBuffer = Buffer.from(imgResponse.data, 'binary');
      } else {
        const path = require("path");
        const fs = require("fs");
        const localPath = path.join(__dirname, "..", "public", student.profilePhoto);
        if (fs.existsSync(localPath)) {
          imgBuffer = fs.readFileSync(localPath);
        }
      }

      if (imgBuffer) {
        const imgX = M + cardW - 95;
        const imgY = cursorY + 20;
        const imgSize = 70;
        let imageDrawn = false;

        doc.save();
        try {
          doc.circle(imgX + imgSize / 2, imgY + imgSize / 2, imgSize / 2).clip();
          doc.image(imgBuffer, imgX, imgY, { width: imgSize, height: imgSize });
          imageDrawn = true;
        } catch (imgErr) {
          console.error("PDFKit image rendering error in student report:", imgErr);
        }
        doc.restore();

        if (imageDrawn) {
          doc.circle(imgX + imgSize / 2, imgY + imgSize / 2, imgSize / 2).lineWidth(1.5).stroke("#4b2d84");
        }
      }
    } catch (err) {
      console.error("Failed to load student profile picture in report:", err);
    }
  }

  cursorY += 135;

  // Attendance Summary Card
  doc.fillColor("#4b2d84").font("Times-Bold").fontSize(12)
    .text("ATTENDANCE OVERVIEW", M, cursorY, { characterSpacing: 1 });
  cursorY += 25;

  doc.roundedRect(M, cursorY, cardW, 80, 8).fill("white").stroke("#e5e7eb");

  const boxW = cardW / 4;

  // Box 1: Total Days
  doc.fillColor("#6b7280").font("Times-Roman").fontSize(10).text("Working Days", M, cursorY + 20, { width: boxW, align: "center" });
  doc.fillColor("#111827").font("Times-Bold").fontSize(22).text(stats.presentDays + stats.absentDays, M, cursorY + 35, { width: boxW, align: "center" });

  doc.rect(M + boxW, cursorY + 15, 1, 50).fill("#f3f4f6");

  // Box 2: Present
  doc.fillColor("#6b7280").font("Times-Roman").fontSize(10).text("Present", M + boxW, cursorY + 20, { width: boxW, align: "center" });
  doc.fillColor("#059669").font("Times-Bold").fontSize(22).text(stats.presentDays, M + boxW, cursorY + 35, { width: boxW, align: "center" });

  doc.rect(M + boxW * 2, cursorY + 15, 1, 50).fill("#f3f4f6");

  // Box 3: Absent
  doc.fillColor("#6b7280").font("Times-Roman").fontSize(10).text("Absent", M + boxW * 2, cursorY + 20, { width: boxW, align: "center" });
  doc.fillColor("#dc2626").font("Times-Bold").fontSize(22).text(stats.absentDays, M + boxW * 2, cursorY + 35, { width: boxW, align: "center" });

  doc.rect(M + boxW * 3, cursorY + 15, 1, 50).fill("#f3f4f6");

  // Box 4: Percentage
  doc.fillColor("#6b7280").font("Times-Roman").fontSize(10).text("Percentage", M + boxW * 3, cursorY + 20, { width: boxW, align: "center" });
  doc.fillColor("#4b2d84").font("Times-Bold").fontSize(22).text(`${stats.attendancePercentage}%`, M + boxW * 3, cursorY + 35, { width: boxW, align: "center" });

  cursorY += 110;

  function checkPageAdd(heightNeeded) {
    if (cursorY + heightNeeded > doc.page.height - 60) {
      doc.addPage();
      doc.rect(0, 0, W, doc.page.height).fill("#fafafa");
      drawWatermark();

      doc.rect(0, 0, W, 40).fill(primaryGrad);
      doc.fillColor("white").font("Times-Bold").fontSize(14)
        .text("STUDENT REPORT", M, 13);
      doc.fillColor("#e9d5ff").font("Times-Roman").fontSize(10)
        .text(student.studentName, W - M - 200, 15, { align: "right", width: 200 });

      cursorY = 70;
    }
  }

  function drawTableHeader(title, columns, widths) {
    checkPageAdd(80);

    doc.fillColor("#4b2d84").font("Times-Bold").fontSize(12)
      .text(title.toUpperCase(), M, cursorY, { characterSpacing: 1 });
    cursorY += 20;

    doc.roundedRect(M, cursorY, cardW, 25, 4).fill("#ede9fe");

    doc.fillColor("#4b2d84").font("Times-Bold").fontSize(9);
    let curX = M + 15;
    columns.forEach((col, i) => {
      doc.text(col.toUpperCase(), curX, cursorY + 8, { width: widths[i], characterSpacing: 0.5 });
      curX += widths[i];
    });
    cursorY += 25;
  }

  // Fee Payments Table
  const feeCols = ["For Month", "Date Paid", "Method", "Amount", "Status"];
  const feeWidths = [140, 100, 100, 100, 70];

  drawTableHeader("Fee Payment History", feeCols, feeWidths);

  const monthsList = ["May", "June", "July", "August", "September", "October", "November", "December", "January", "February", "March", "April"];

  // Extract viewing year range from the context if possible, or use stats
  const academicFees = monthsList.map((m, idx) => {
    // In SaaS, we just look for records matching the viewingYear
    const record = stats.recentFees.find(f => f.month === m);
    return { month: m, record };
  });

  academicFees.forEach((item, i) => {
    const isEven = i % 2 === 0;
    if (!isEven) doc.rect(M, cursorY, cardW, 20).fill("#f3f4f6");
    else doc.rect(M, cursorY, cardW, 20).fill("white");
    doc.rect(M, cursorY + 20, cardW, 0.5).fill("#e5e7eb");

    let curX = M + 15;
    doc.fillColor("#111827").font("Times-Bold").fontSize(8).text(`${item.month}`, curX, cursorY + 6, { width: feeWidths[0] });
    curX += feeWidths[0];

    if (item.record) {
      doc.fillColor("#4b5563").font("Times-Roman").fontSize(8);
      doc.text(new Date(item.record.datePaid).toLocaleDateString("en-IN"), curX, cursorY + 6, { width: feeWidths[1] });
      curX += feeWidths[1];
      doc.text(item.record.method || "-", curX, cursorY + 6, { width: feeWidths[2] });
      curX += feeWidths[2];
      doc.fillColor("#4b2d84").font("Times-Bold").text(`Rs. ${Number(item.record.amount).toLocaleString("en-IN")}`, curX, cursorY + 6, { width: feeWidths[3] });
      curX += feeWidths[3];
      doc.roundedRect(curX, cursorY + 4, 40, 12, 6).fill("#d1fae5");
      doc.fillColor("#065f46").fontSize(7).text("PAID", curX, cursorY + 7, { width: 40, align: "center" });
    } else {
      doc.fillColor("#9ca3af").font("Times-Italic").fontSize(8);
      doc.text("-", curX, cursorY + 6, { width: feeWidths[1] });
      curX += feeWidths[1];
      doc.text("-", curX, cursorY + 6, { width: feeWidths[2] });
      curX += feeWidths[2];
      doc.text("-", curX, cursorY + 6, { width: feeWidths[3] });
      curX += feeWidths[3];
      doc.roundedRect(curX, cursorY + 4, 50, 12, 6).fill("#fee2e2");
      doc.fillColor("#991b1b").fontSize(6.5).text("PENDING", curX, cursorY + 7, { width: 50, align: "center" });
    }
    cursorY += 21;
  });

  // Force Academic Performance to Page 2
  doc.addPage();
  doc.rect(0, 0, W, doc.page.height).fill("#fafafa");
  drawWatermark();
  doc.rect(0, 0, W, 40).fill(primaryGrad);
  doc.fillColor("white").font("Times-Bold").fontSize(14).text("STUDENT PERFORMANCE REPORT", M, 13);
  doc.fillColor("#e9d5ff").font("Times-Roman").fontSize(10).text(student.studentName, W - M - 200, 15, { align: "right", width: 200 });
  cursorY = 70;

  // Academic Performance Table
  const academicCols = ["Date", "Test Name", "Subject", "Topic", "Score", "%"];
  const academicWidths = [70, 110, 80, 130, 50, 70];

  drawTableHeader("Detailed Academic Performance", academicCols, academicWidths);

  if (stats.recentScores && stats.recentScores.length > 0) {
    stats.recentScores.forEach((score, i) => {
      checkPageAdd(35);
      const isEven = i % 2 === 0;
      if (!isEven) doc.rect(M, cursorY, cardW, 25).fill("#f3f4f6");
      else doc.rect(M, cursorY, cardW, 25).fill("white");
      doc.rect(M, cursorY + 25, cardW, 1).fill("#e5e7eb");

      let curX = M + 15;
      const testDate = (score.testId && score.testId.testDate) ? score.testId.testDate : score.createdAt;
      doc.fillColor("#4b5563").font("Times-Roman").fontSize(8).text(new Date(testDate).toLocaleDateString("en-IN"), curX, cursorY + 8, { width: academicWidths[0] });
      curX += academicWidths[0];
      doc.fontSize(9).text(score.testName || 'Test', curX, cursorY + 8, { width: academicWidths[1] });
      curX += academicWidths[1];
      const subjectName = (score.testId && score.testId.subject) ? score.testId.subject : 'Overall';
      doc.text(subjectName, curX, cursorY + 8, { width: academicWidths[2] });
      curX += academicWidths[2];
      const topicName = (score.testId && score.testId.topic) ? score.testId.topic : '-';
      doc.text(topicName, curX, cursorY + 8, { width: academicWidths[3] });
      curX += academicWidths[3];
      doc.text(score.score != null ? score.score.toString() : '-', curX, cursorY + 8, { width: academicWidths[4] });
      curX += academicWidths[4];
      doc.fillColor(score.percentage >= 80 ? '#059669' : score.percentage >= 50 ? '#d97706' : '#dc2626').font('Times-Bold').text(score.percentage != null ? score.percentage + '%' : '-', curX, cursorY + 8, { width: academicWidths[5] });
      cursorY += 25;
    });
  } else {
    doc.fillColor('#6b7280').font('Times-Italic').fontSize(10).text('No recent academic records found.', M, cursorY + 20);
  }

  // Footer
  doc.rect(0, doc.page.height - 50, W, 2).fill('#e9d5ff');
  doc.fillColor('#9ca3af').font('Times-Italic').fontSize(9)
    .text('This is a computer-generated report and does not require a signature.', M, doc.page.height - 40, { align: 'center', width: W - M * 2, continued: true })
    .fillColor('#4b2d84').text(' | Powered by ClassConnect', { link: 'https://classconnects.vercel.app' });
}

async function generateStudentReportPDF(student, stats, res, disposition) {
  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', disposition + '; filename=student-report-' + student.studentId + '.pdf');
  doc.pipe(res);
  await drawStudentReport(doc, student, stats);
  doc.end();
}


module.exports = { drawStudentReport, generateStudentReportPDF };
