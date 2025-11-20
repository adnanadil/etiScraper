const fs = require("fs");
const nodemailer = require("nodemailer");
const path = require("path");

async function shareAllTenders() {
// (async () => {
  const jsonFile = "tenderData/tenders_all.json";
  const csvFile = "tenderData/tenders_all.csv";

  if (!fs.existsSync(jsonFile)) {
    console.log("❌ No tenders_all.json file found!");
    return;
  }

  const jsonData = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
  if (!jsonData.length) {
    console.log("ℹ️ No data found in tenders_all.json");
    return;
  }

  // ✅ Show only top 10 for preview in email
  const previewData = jsonData.slice(0, 10);

  // 🧱 Create a neat HTML table
  const htmlTable = `
    <h2>📊 Etimad Tender Summary</h2>
    <p>Total tenders scraped: <b>${jsonData.length}</b></p>
    <p>Attached: <b>tenders_all.csv</b> and <b>tenders_all.json</b></p>
    <hr>
    <table border="1" cellspacing="0" cellpadding="5" style="border-collapse: collapse;">
      <tr>
        <th>#</th>
        <th>Title</th>
        <th>Publish Date</th>
        <th>Inquiry Deadline</th>
        <th>Bid Deadline</th>
        <th>Keyword</th>
      </tr>
      ${previewData
        .map(
          (t, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${t.title}</td>
          <td>${t.publishDate}</td>
          <td>${t.inquiryDeadline}</td>
          <td>${t.bidDeadline}</td>
          <td>${t.keyword}</td>
        </tr>`
        )
        .join("")}
    </table>
  `;

  // 📧 Create transporter (replace credentials)
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "tendersetimad@gmail.com", // ⚠️ Use app password, not real password
      pass: "ujodkemtgbmorrxs",
    },
  });

  const mailOptions = {
    from: "tendersetimad@gmail.com",
    to: "adnanadil529@gmail.com",
    subject: "Etimad Tender Report - All Keywords",
    html: htmlTable,
    attachments: [
      { filename: path.basename(csvFile), path: csvFile },
      { filename: path.basename(jsonFile), path: jsonFile },
    ],
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("We are here");
    console.log("✅ Email sent successfully with tender data!");
  } catch (error) {
    console.error("❌ Failed to send email:", error);
  }
}

shareAllTenders()