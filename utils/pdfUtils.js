const PDFDocument = require("pdfkit");
const axios = require("axios");

async function renderReceiptPDF(doc, fee, student) {

  const W = doc.page.width;
  const M = 50;

  doc.rect(0, 0, W, doc.page.height).fill("#fafafa");

  const watermarkText = `TUITION HUB EDUCATION CENTRE - ${student.studentName?.toUpperCase?.() || "STUDENT"}`;
  doc.save();
  doc.fillOpacity(0.06);
  doc.fillColor("#4b2d84");
  doc.font("Times-Bold").fontSize(10);
  for (let y = -20; y < doc.page.height + 80; y += 90) {
    for (let x = -40; x < W + 100; x += 220) {
      doc.save();
      doc.translate(x, y);
      doc.rotate(-30);
      doc.text(watermarkText, 0, 0);
      doc.restore();
    }
  }
  doc.restore();

  const primaryGrad = doc.linearGradient(0, 0, W, 130);
  primaryGrad.stop(0, "#4b2d84").stop(1, "#6b46c1");

  const headerHeight = 140;
  doc.rect(0, 0, W, headerHeight).fill(primaryGrad);
  doc.save();
  doc.fillOpacity(0.08);
  doc.circle(W - 50, 35, 78).fill("white");
  doc.circle(W - 90, 105, 52).fill("white");
  doc.circle(50, 20, 60).fill("white");
  doc.restore();

  const headerUrl = process.env.CLOUDINARY_HEADER_URL;
  if (headerUrl) {
    try {
      const response = await axios.get(headerUrl, { responseType: "arraybuffer" });
      const imgBuffer = Buffer.from(response.data, "binary");
      doc.image(imgBuffer, M, 18, { fit: [W - 2 * M, 70], align: "center" });
    } catch (_) {
      // Fallback to text below.
    }
  }

  doc.fillColor("white").font("Times-Bold").fontSize(22)
    .text("PAYMENT RECEIPT", M, 92, { width: W - M * 2, align: "left", characterSpacing: 1 });
  doc.fillColor("#e9d5ff").font("Times-Roman").fontSize(10)
    .text("Tuition Hub Education Centre", M, 114, { width: W - M * 2, align: "left" });

  const metaY = headerHeight + 18;
  doc.fillColor("#6b7280").font("Helvetica").fontSize(9)
    .text(`Receipt ID: ${fee._id}`, M, metaY, { align: "right", width: W - M * 2 });
  doc.text(`Generated: ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}`, M, metaY + 14, { align: "right", width: W - M * 2 });

  const cardY = metaY + 42;
  const cardH = 110;
  doc.roundedRect(M, cardY, W - M * 2, cardH, 8).fill("#ffffff");
  doc.roundedRect(M, cardY, W - M * 2, cardH, 8).stroke("#e5e7eb");
  doc.save();
  doc.roundedRect(M, cardY, W - M * 2, cardH, 8).clip();
  doc.rect(M, cardY, 6, cardH).fill("#bde045");
  doc.restore();

  doc.fillColor("#4b2d84").font("Helvetica-Bold").fontSize(10)
    .text("BILLED TO", M + 22, cardY + 14);
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(14)
    .text(student.studentName || "Student", M + 22, cardY + 32);
  const leftX = M + 22;
  const rightX = M + 285;
  const labelWidth = 84;
  const valueWidth = 170;
  const rowGap = 18;

  const detailPairs = [
    [leftX, cardY + 54, "Student ID", student.studentId || "Not provided"],
    [leftX, cardY + 54 + rowGap, "Email", student.email || fee.studentEmail || "Not provided"],
    [rightX, cardY + 54, "Batch", student.batch?.name || student.batch?.academicYear || "Not assigned"],
    [rightX, cardY + 54 + rowGap, "Mobile", student.mobileNo ? `+91 ${student.mobileNo}` : "Not provided"],
  ];

  detailPairs.forEach(([x, y, label, value]) => {
    doc.fillColor("#6b7280").font("Helvetica").fontSize(10)
      .text(`${label}:`, x, y, { width: labelWidth });
    doc.fillColor("#111827").font("Helvetica").fontSize(10)
      .text(value, x + labelWidth, y, { width: valueWidth });
  });

  const tableY = cardY + cardH + 24;
  const rows = [
    ["Month", `${fee.month} ${fee.year}`],
    ["Amount Paid", `Rs. ${Number(fee.amount).toLocaleString("en-IN")}`],
    ["Date Paid", new Date(fee.datePaid).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })],
    ["Payment Method", fee.method || "Razorpay"],
    ["Status", fee.status || "Paid"],
  ];

  const col1 = M;
  const col2 = M + 260;
  const rowH = 36;

  doc.rect(col1, tableY, W - M * 2, rowH).fill("#4b2d84");
  doc.fillColor("white").font("Helvetica-Bold").fontSize(10)
    .text("DESCRIPTION", col1 + 14, tableY + 11)
    .text("DETAILS", col2, tableY + 11);

  rows.forEach((row, i) => {
    const y = tableY + rowH + i * rowH;
    const bg = i % 2 === 0 ? "#ffffff" : "#faf5ff";
    doc.rect(col1, y, W - M * 2, rowH).fill(bg).stroke("#e5e7eb");

    doc.fillColor("#374151").font("Helvetica").fontSize(10)
      .text(row[0], col1 + 14, y + 11);

    if (row[0] === "Status") {
      doc.roundedRect(col2, y + 7, 52, 18, 6).fill("#d1fae5");
      doc.fillColor("#065f46").font("Helvetica-Bold").fontSize(10)
        .text(row[1], col2 + 6, y + 11);
    } else {
      doc.fillColor("#111827").font("Helvetica-Bold").fontSize(10)
        .text(row[1], col2, y + 11);
    }
  });

  const totalY = tableY + rowH + rows.length * rowH;
  doc.rect(col1, totalY, W - M * 2, rowH + 4).fill("#4b2d84");
  doc.fillColor("white").font("Helvetica-Bold").fontSize(11)
    .text("TOTAL PAID", col1 + 14, totalY + 12)
    .text(`Rs. ${Number(fee.amount).toLocaleString("en-IN")}`, col2, totalY + 12);

  const footerY = totalY + rowH + 18;
  doc.rect(0, footerY + 26, W, 2).fill("#e9d5ff");
  doc.fillColor("#9ca3af").font("Helvetica-Oblique").fontSize(9)
    .text("This is a computer-generated receipt and does not require a signature.", M, footerY + 34, { align: "center", width: W - M * 2 });
  doc.fillColor("#6b7280").font("Helvetica").fontSize(9)
    .text("Tuition Hub Education Centre · Andheri (East), Mumbai 400059 · 9967466955", M, footerY + 50, { align: "center", width: W - M * 2 });
}

async function generateReceiptPDF(fee, student, res, disposition) {
  const doc = new PDFDocument({ size: "A4", margin: 0 });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `${disposition}; filename=receipt-${fee._id}.pdf`
  );

  doc.pipe(res);
  await renderReceiptPDF(doc, fee, student);
  doc.end();
}

async function buildReceiptPDFBuffer(fee, student) {
  const doc = new PDFDocument({ size: "A4", margin: 0 });
  const chunks = [];

  doc.on("data", (chunk) => chunks.push(chunk));

  const buffer = await new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    renderReceiptPDF(doc, fee, student)
      .then(() => doc.end())
      .catch(reject);
  });

  return buffer;
}

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
    .text('This is a computer-generated report and does not require a signature.', M, doc.page.height - 40, { align: 'center', width: W - M * 2 });
}

async function generateStudentReportPDF(student, stats, res, disposition) {
  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', disposition + '; filename=student-report-' + student.studentId + '.pdf');
  doc.pipe(res);
  await drawStudentReport(doc, student, stats);
  doc.end();
}

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
        .text('This is a computer-generated report and does not require a signature.', M, doc.page.height - 40, { align: 'center', width: W - M * 2 });
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
        .text('This is a computer-generated report and does not require a signature.', M, doc.page.height - 40, { align: 'center', width: W - M * 2 });
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

async function drawStudentDirectoryReport(doc, students, selectedYearStr) {
  const W = doc.page.width;
  const H = doc.page.height;
  const M = 40;

  function drawWatermark() {
    doc.save();
    doc.fillOpacity(0.06);
    doc.fillColor("#4b2d84");
    doc.font("Times-Bold").fontSize(10);

    const watermarkText = `TUITION HUB EDU CENTER - STUDENT DIRECTORY    `;
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

  doc.fillColor("white").font("Times-Bold").fontSize(20)
    .text("STUDENT DIRECTORY", M, 110, { align: "left", characterSpacing: 1 });

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
        .text("STUDENT DIRECTORY", M, 13);
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

  const cardW = W - 2 * M;

  // Group students by batch name
  const byBatch = {};
  students.forEach(s => {
    const batchName = s.batch ? s.batch.name : 'Unassigned';
    if (!byBatch[batchName]) byBatch[batchName] = [];
    byBatch[batchName].push(s);
  });

  const getBatchOrderValue = (name) => {
    if (!name) return 999;
    const lowerName = name.toLowerCase();
    if (lowerName.includes("pre") || lowerName.includes("kg")) return 0;
    const match = lowerName.match(/^(\d+)/);
    if (match) return parseInt(match[1]);
    return 100;
  };
  const sortedBatches = Object.keys(byBatch).sort((a,b) => getBatchOrderValue(a) - getBatchOrderValue(b));

  const cols = ["Photo", "Student ID", "Name", "Mobile", "Email"];
  const widths = [45, 80, 155, 95, 140];

  for (const cls of sortedBatches) {
    drawTableHeader(`Batch: ${cls}`, cols, widths);

    for (const [i, r] of byBatch[cls].entries()) {
      checkPageAdd(30);
      const isEven = i % 2 === 0;
      doc.rect(M, cursorY, cardW, 30).fill(isEven ? "white" : "#f3f4f6");
      doc.rect(M, cursorY + 30, cardW, 1).fill("#e5e7eb");

      let curX = M + 15;

      // Draw profile photo or fallback
      const imgSize = 20;
      const imgX = curX + 2;
      const imgY = cursorY + 5;
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
              console.error("PDFKit image rendering error in directory:", imgErr);
            }
            doc.restore();
            
            if (imageDrawn) {
              doc.circle(imgX + imgSize/2, imgY + imgSize/2, imgSize/2).lineWidth(0.5).stroke("#4b2d84");
              hasImage = true;
            }
          }
        } catch (err) {
          console.error("Failed to load profile photo in directory report:", err);
        }
      }

      if (!hasImage) {
        doc.save();
        doc.fillColor("#ede9fe");
        doc.circle(imgX + imgSize/2, imgY + imgSize/2, imgSize/2).fill();
        
        doc.fillColor("#4b2d84").font("Times-Bold").fontSize(9);
        const firstLetter = r.studentName ? r.studentName.charAt(0).toUpperCase() : '?';
        doc.text(firstLetter, imgX, imgY + 5.5, { width: imgSize, align: 'center' });
        doc.restore();
      }

      curX += widths[0];

      // ID
      doc.fillColor("#6b7280").font("Times-Roman").fontSize(9)
        .text(r.studentId, curX, cursorY + 10, { width: widths[1] });
      curX += widths[1];

      // Name
      doc.fillColor("#111827").font("Times-Bold").fontSize(9)
        .text(r.studentName, curX, cursorY + 10, { width: widths[2] });
      curX += widths[2];

      // Mobile
      doc.fillColor("#4b5563").font("Times-Roman").fontSize(9)
        .text(r.mobileNo || '-', curX, cursorY + 10, { width: widths[3] });
      curX += widths[3];

      // Email
      doc.fillColor("#4b5563").font("Times-Roman").fontSize(8)
        .text(r.email || '-', curX, cursorY + 10, { width: widths[4], truncate: true });

      cursorY += 30;
    }
    cursorY += 15;
  }

  function writeFooter() {
    for (let p = 0; p < doc.bufferedPageRange().count; p++) {
      doc.switchToPage(p);
      doc.rect(0, doc.page.height - 50, W, 2).fill('#e9d5ff');
      doc.fillColor('#9ca3af').font('Times-Italic').fontSize(9)
        .text('This is a computer-generated directory and does not require a signature.', M, doc.page.height - 40, { align: 'center', width: W - M * 2 });
    }
  }

  writeFooter();
}

async function generateStudentDirectoryPDF(students, selectedYearStr, res, disposition = 'inline') {
  const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', disposition + `; filename=student-directory-${selectedYearStr}.pdf`);
  doc.pipe(res);
  await drawStudentDirectoryReport(doc, students, selectedYearStr);
  doc.end();
}

module.exports = { generateReceiptPDF, buildReceiptPDFBuffer, drawStudentReport, generateStudentReportPDF, generateFeeDefaultersPDF, generateAttendanceDefaultersPDF, generateStudentDirectoryPDF };
