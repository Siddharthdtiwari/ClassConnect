const PDFDocument = require('pdfkit');
const axios = require('axios');

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
    .text("Tuition Hub Education Centre · Andheri (East), Mumbai 400059 · 9967466955", M, footerY + 48, { align: "center", width: W - M * 2 });
  doc.fillColor("#d8b4fe").font("Helvetica").fontSize(8)
    .text("Powered by ClassConnect", M, footerY + 62, { align: "center", width: W - M * 2, link: "https://classconnects.vercel.app" });
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


module.exports = { renderReceiptPDF, generateReceiptPDF, buildReceiptPDFBuffer };
