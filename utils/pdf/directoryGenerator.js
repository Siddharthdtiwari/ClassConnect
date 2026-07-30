const PDFDocument = require('pdfkit');
const axios = require('axios');

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



async function drawFeeCollectionSheet(doc, data) {
  const { month, year, nextMonth, students, feeByStudent = {} } = data;
  const W = doc.page.width;
  const H = doc.page.height;
  const M = 40;

  const byBatch = {};
  
  function formatNameFit(name, maxWidth) {
    if (!name) return "";
    let upName = name.toUpperCase().trim();
    if (doc.widthOfString(upName) <= maxWidth) return upName;
    
    const parts = upName.split(/\s+/);
    if (parts.length > 2) {
      const first = parts[0];
      const last = parts[parts.length - 1];
      let middle = "";
      for (let i = 1; i < parts.length - 1; i++) {
        middle += parts[i].charAt(0) + ". ";
      }
      upName = `${first} ${middle}${last}`;
    }
    return upName;
  }
  
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

  const group1 = sortedBatches.filter(b => getBatchOrderValue(b) <= 4);
  const group2 = sortedBatches.filter(b => getBatchOrderValue(b) > 4);

  let cursorY = M;
  let headerImageBuffer = null;

  try {
    const headerUrl = process.env.CLOUDINARY_HEADER_URL;
    if (headerUrl) {
      const axios = require("axios");
      const response = await axios.get(headerUrl, { responseType: "arraybuffer" });
      headerImageBuffer = Buffer.from(response.data, "binary");
    }
  } catch(err) {}

  function drawWatermark() {
    doc.save();
    doc.fillOpacity(0.06);
    doc.fillColor("#4b2d84");
    doc.font("Times-Bold").fontSize(10);
    const watermarkText = `TUITION HUB EDU CENTER - FEE COLLECTION SHEET    `;
    const stepX = 180;
    const stepY = 80;
    for (let y = -50; y < H + 100; y += stepY) {
      for (let x = -50; x < W + 100; x += stepX) {
        doc.save(); doc.translate(x, y); doc.rotate(-30); doc.text(watermarkText, 0, 0); doc.restore();
      }
    }
    doc.restore();
  }

  let isFirstPage = true;
  function drawPageHeader() {
    doc.rect(0, 0, W, H).fill("#fafafa");
    drawWatermark();
    
    let headerHeight;
    if (isFirstPage) {
      headerHeight = 185;
      const primaryGrad = doc.linearGradient(0, 0, W, headerHeight);
      primaryGrad.stop(0, "#4b2d84").stop(1, "#6b46c1");

      doc.rect(0, 0, W, headerHeight).fill(primaryGrad);

      doc.save();
      doc.fillOpacity(0.1);
      doc.circle(W - 40, 40, 80).fill("white");
      doc.circle(W - 80, 100, 50).fill("white");
      doc.circle(40, 20, 60).fill("white");
      doc.restore();

      if (headerImageBuffer) {
        doc.image(headerImageBuffer, M, 20, { fit: [W - 2 * M, 80], align: 'center' });
      }

      doc.fillColor("white").font("Times-Bold").fontSize(34)
        .text(`${month.toUpperCase()} ${year}`, M, 105, { align: "center", width: W - 2 * M });

      doc.fillColor("#e9d5ff").font("Times-Bold").fontSize(14)
        .text(`TO BE PAID BETWEEN 1ST AND 10TH ${nextMonth.toUpperCase()}`, M, 150, { align: "center", width: W - 2 * M });
      
      isFirstPage = false;
    } else {
      headerHeight = 40;
      const primaryGrad = doc.linearGradient(0, 0, W, headerHeight);
      primaryGrad.stop(0, "#4b2d84").stop(1, "#6b46c1");
      doc.rect(0, 0, W, headerHeight).fill(primaryGrad);
      
      doc.fillColor("white").font("Times-Bold").fontSize(10)
        .text(`${month.toUpperCase()} ${year} - FEE COLLECTION SHEET (CONT.)`, M, 15, { align: "center", width: W - 2 * M });
    }

    cursorY = headerHeight + 20;
  }

  const cols = ["STD", "ROLL NO.", "NAME", "DATE", "AMOUNT", "MODE"];
  const widths = [40, 65, 175, 75, 75, 85];
  const tableWidth = widths.reduce((a, b) => a + b, 0);
  const tableM = (W - tableWidth) / 2;
  const rowH = 20;

  function checkPageAdd(heightNeeded) {
    if (cursorY + heightNeeded > H - 40) {
      // Close the previous table border
      doc.lineWidth(1).moveTo(tableM, cursorY).lineTo(tableM + tableWidth, cursorY).stroke("#d1d5db");
      doc.addPage();
      drawPageHeader();
      drawTableHeader();
    }
  }

  function drawTableHeader() {
    doc.rect(tableM, cursorY, tableWidth, 24).fill("#ede9fe");
    doc.lineWidth(1);
    doc.rect(tableM, cursorY, tableWidth, 24).stroke("#d1d5db");
    
    doc.fillColor("#4b2d84").font("Times-Bold").fontSize(10);
    let curX = tableM;
    cols.forEach((col, i) => {
      if (i > 0) {
        doc.moveTo(curX, cursorY).lineTo(curX, cursorY + 24).stroke("#d1d5db");
      }
      doc.text(col, curX, cursorY + 8, { width: widths[i], align: "center" });
      curX += widths[i];
    });
    cursorY += 24;
  }

  async function renderGroup(batches) {
    drawTableHeader();

    let globalRowIndex = 0;

    for (const cls of batches) {
      const batchStudents = byBatch[cls];
      const batchHeight = batchStudents.length * rowH;

      checkPageAdd(batchHeight); 

      let batchStartY = cursorY;

      for (let i = 0; i < batchStudents.length; i++) {
        const s = batchStudents[i];
        const isEven = globalRowIndex % 2 === 0;
        
        // Fill row background
        doc.rect(tableM + widths[0], cursorY, tableWidth - widths[0], rowH).fill(isEven ? "white" : "#f9fafb");
        // Fill STD column background (white for the whole merged cell block)
        if (i === 0) {
          doc.rect(tableM, batchStartY, widths[0], batchHeight).fill("white");
        }

        // Horizontal line
        if (i === 0) {
          doc.lineWidth(2.5).moveTo(tableM, cursorY).lineTo(tableM + tableWidth, cursorY).stroke("#9ca3af");
        } else {
          doc.lineWidth(1).moveTo(tableM + widths[0], cursorY).lineTo(tableM + tableWidth, cursorY).stroke("#d1d5db");
        }

        let curX = tableM + widths[0]; 
        
        // Vertical lines
        doc.lineWidth(1).moveTo(tableM, cursorY).lineTo(tableM, cursorY + rowH).stroke("#d1d5db"); // left border
        for (let j = 1; j < cols.length; j++) {
          doc.moveTo(curX, cursorY).lineTo(curX, cursorY + rowH).stroke("#d1d5db");
          curX += widths[j];
        }
        doc.lineWidth(1).moveTo(tableM + tableWidth, cursorY).lineTo(tableM + tableWidth, cursorY + rowH).stroke("#d1d5db"); // right border

        const textY = cursorY + 6;
        
        doc.fillColor("#4b2d84").font("Times-Bold").fontSize(9);
        doc.text(s.studentId, tableM + widths[0] + 5, textY, { width: widths[1] - 10, lineBreak: false });
        
        doc.fillColor("#111827").font("Times-Bold");
        const formattedStudentName = formatNameFit(s.studentName, widths[2] - 10);
        doc.text(formattedStudentName, tableM + widths[0] + widths[1] + 5, textY, { width: widths[2] - 10, height: 12, ellipsis: true });

        const fee = feeByStudent[s.studentId];
        if (fee) {
          doc.fillColor("#4b2d84").font("Times-Bold").fontSize(9);
          
          let dateStr = "";
          let amountStr = "";
          let modeStr = "";
          
          if (fee.status === "NA") {
            const mergedX = tableM + widths[0] + widths[1] + widths[2];
            const mergedW = widths[3] + widths[4] + widths[5];
            const reason = fee.naReason || "";
            const naLabel = reason ? `N/A – ${reason}` : "N/A";
            doc.fillColor("#9ca3af").font("Times-BoldItalic").fontSize(8);
            doc.text(naLabel, mergedX + 5, textY + 1, { width: mergedW - 10, align: "center", height: 12, ellipsis: true });
          } else {
            if (fee.datePaid) {
              const d = new Date(fee.datePaid);
              dateStr = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
            }
            amountStr = fee.amount ? `${fee.amount}` : "";
            modeStr = fee.method ? fee.method.toUpperCase() : "";
          
            doc.text(dateStr, tableM + widths[0] + widths[1] + widths[2], textY, { width: widths[3], align: "center", height: 12, ellipsis: true });
            doc.text(amountStr, tableM + widths[0] + widths[1] + widths[2] + widths[3], textY, { width: widths[4], align: "center", height: 12, ellipsis: true });
            doc.text(modeStr, tableM + widths[0] + widths[1] + widths[2] + widths[3] + widths[4], textY, { width: widths[5], align: "center", height: 12, ellipsis: true });
          }
        }

        cursorY += rowH;
        globalRowIndex++;
      }
      
      const batchCenterY = batchStartY + (batchHeight / 2) - 5;
      let shortCls = cls.toUpperCase();
      if (shortCls.includes("PRE PRIMARY")) shortCls = "JR SR";
      
      doc.fillColor("#4b2d84").font("Times-Bold").fontSize(10);
      doc.text(shortCls, tableM, batchCenterY, { width: widths[0], align: "center" });
    }
    
    doc.lineWidth(2.5).moveTo(tableM, cursorY).lineTo(tableM + tableWidth, cursorY).stroke("#9ca3af");
  }

  async function renderTeachers(teachersList) {
    if (!teachersList || teachersList.length === 0) return;
    
    teachersList.sort((a, b) => {
      const idA = (a.teacherId || "").toLowerCase();
      const idB = (b.teacherId || "").toLowerCase();
      return idA.localeCompare(idB);
    });
    
    // Add a bit of space before the teacher section if there's room
    if (cursorY + rowH + 24 > H - 40) {
      checkPageAdd(H); // force a new page
    } else {
      cursorY += 10;
    }

    doc.rect(tableM, cursorY, tableWidth, 24).fill("#ede9fe");
    doc.lineWidth(1);
    doc.rect(tableM, cursorY, tableWidth, 24).stroke("#d1d5db");
    
    doc.fillColor("#4b2d84").font("Times-Bold").fontSize(10);
    let curX = tableM;
    const teacherCols = ["TYPE", "ID", "NAME", "DATE", "AMOUNT", "MODE"];
    teacherCols.forEach((col, i) => {
      if (i > 0) {
        doc.moveTo(curX, cursorY).lineTo(curX, cursorY + 24).stroke("#d1d5db");
      }
      doc.text(col, curX, cursorY + 8, { width: widths[i], align: "center" });
      curX += widths[i];
    });
    cursorY += 24;

    const batchHeight = teachersList.length * rowH;
    checkPageAdd(batchHeight);
    
    let batchStartY = cursorY;

    for (let i = 0; i < teachersList.length; i++) {
      const t = teachersList[i];
      const isEven = i % 2 === 0;
      
      doc.rect(tableM + widths[0], cursorY, tableWidth - widths[0], rowH).fill(isEven ? "white" : "#f9fafb");
      if (i === 0) {
        doc.rect(tableM, batchStartY, widths[0], batchHeight).fill("white");
      }

      if (i === 0) {
        doc.lineWidth(2.5).moveTo(tableM, cursorY).lineTo(tableM + tableWidth, cursorY).stroke("#9ca3af");
      } else {
        doc.lineWidth(1).moveTo(tableM + widths[0], cursorY).lineTo(tableM + tableWidth, cursorY).stroke("#d1d5db");
      }

      let tCurX = tableM + widths[0]; 
      
      doc.lineWidth(1).moveTo(tableM, cursorY).lineTo(tableM, cursorY + rowH).stroke("#d1d5db");
      for (let j = 1; j < cols.length; j++) {
        doc.moveTo(tCurX, cursorY).lineTo(tCurX, cursorY + rowH).stroke("#d1d5db");
        tCurX += widths[j];
      }
      doc.lineWidth(1).moveTo(tableM + tableWidth, cursorY).lineTo(tableM + tableWidth, cursorY + rowH).stroke("#d1d5db");

      const textY = cursorY + 6;
      
      doc.fillColor("#4b2d84").font("Times-Bold").fontSize(9);
      doc.text(t.teacherId || "TCH", tableM + widths[0] + 5, textY, { width: widths[1] - 10, height: 12, ellipsis: true });
      
      doc.fillColor("#111827").font("Times-Bold");
      const formattedTeacherName = formatNameFit((t.teacherName || t.name || ""), widths[2] - 10);
      doc.text(formattedTeacherName, tableM + widths[0] + widths[1] + 5, textY, { width: widths[2] - 10, height: 12, ellipsis: true });

      cursorY += rowH;
    }
    
    const batchCenterY = batchStartY + (batchHeight / 2) - 5;
    doc.fillColor("#4b2d84").font("Times-Bold").fontSize(10);
    doc.text("STAFF", tableM, batchCenterY, { width: widths[0], align: "center" });
    
    doc.lineWidth(2.5).moveTo(tableM, cursorY).lineTo(tableM + tableWidth, cursorY).stroke("#9ca3af");
  }

  drawPageHeader();
  if (group1.length > 0) {
    await renderGroup(group1);
  }
  
  if (group2.length > 0) {
    doc.addPage();
    drawPageHeader();
    await renderGroup(group2);
  }

  if (data.teachers && data.teachers.length > 0) {
    await renderTeachers(data.teachers);
  }
}

async function generateFeeCollectionSheetPDF(data, res, disposition = 'inline') {
  const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', disposition + `; filename=fee-collection-sheet-${data.month}-${data.year}.pdf`);
  doc.pipe(res);
  await drawFeeCollectionSheet(doc, data);
  doc.end();
}


module.exports = { drawStudentDirectoryReport, generateStudentDirectoryPDF, drawFeeCollectionSheet, generateFeeCollectionSheetPDF };
