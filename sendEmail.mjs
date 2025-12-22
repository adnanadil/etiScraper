import fs from "fs";
import { google } from "googleapis";

// Paths
// const CREDENTIALS_PATH = "credentials.json";
// const TOKEN_PATH = "token.json";

// Fallback allows local testing
const CREDENTIALS_PATH =
  process.env.GMAIL_CREDENTIALS_PATH || "/secrets/gmail-credentials/credentials.json";

const TOKEN_PATH =
  process.env.GMAIL_TOKEN_PATH || "/secrets/gmail-token/token.json";

// Recent (today/yesterday)
const RECENT_JSON = "tenderData/translated/recent_tenders.json";
const RECENT_CSV  = "tenderData/translated/recent_tenders.csv";

// All Active
const ALL_JSON = "tenderData/translated/all_tenders.json";
const ALL_CSV  = "tenderData/translated/all_tenders.csv";

// Load credentials and token
const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));
const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));

const { client_id, client_secret, redirect_uris } = credentials.installed;
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
oAuth2Client.setCredentials(token);

const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

// Convert JSON data to HTML table
function jsonToTable(jsonData) {
  if (!jsonData || jsonData.length === 0) return "<p>No tenders found.</p>";

  const headers = Object.keys(jsonData[0]);
  let table = "<table border='1' cellpadding='5' cellspacing='0' style='border-collapse: collapse;'>";
  table += "<thead><tr>";
  headers.forEach(h => (table += `<th>${h}</th>`));
  table += "</tr></thead><tbody>";

  jsonData.forEach(row => {
    table += "<tr>";
    headers.forEach(h => (table += `<td>${row[h] ?? ""}</td>`));
    table += "</tr>";
  });

  table += "</tbody></table>";
  return table;
}

function safeReadJsonArray(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function sendEmail(toEmails = []) {
  const recentData = safeReadJsonArray(RECENT_JSON);
  const allData = safeReadJsonArray(ALL_JSON);

  const hasRecent = recentData.length > 0;
  const hasAll = allData.length > 0;

  const boundary = "----=_NodeMailBoundary";

  // ✅ HTML body rules
  let htmlBody = `<h2>Latest Tenders Update</h2>`;
  if (!hasRecent) {
    htmlBody += `<p><b>No new tenders today matching our category.</b></p>`;
  } else {
    htmlBody += `<h3>New Tenders (Today/Yesterday)</h3>`;
    htmlBody += jsonToTable(recentData);
  }

  const emailLines = [];
  emailLines.push(`From: 'Tenders Bot' <your-email@gmail.com>`);
  emailLines.push(`To: ${toEmails.join(", ")}`);
  emailLines.push(`Subject: Latest Tenders`);
  emailLines.push(`MIME-Version: 1.0`);
  emailLines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  emailLines.push("");

  // ✅ HTML part (always)
  emailLines.push(`--${boundary}`);
  emailLines.push(`Content-Type: text/html; charset=UTF-8`);
  emailLines.push("");
  emailLines.push(htmlBody);
  emailLines.push("");

  // ✅ Attach recent CSV ONLY if recent JSON has rows
  if (hasRecent && fs.existsSync(RECENT_CSV)) {
    const csvContent = fs.readFileSync(RECENT_CSV);
    emailLines.push(`--${boundary}`);
    emailLines.push(`Content-Type: text/csv; name="recent_tenders.csv"`);
    emailLines.push(`Content-Transfer-Encoding: base64`);
    emailLines.push(`Content-Disposition: attachment; filename="recent_tenders.csv"`);
    emailLines.push("");
    emailLines.push(csvContent.toString("base64"));
    emailLines.push("");
  }

  // ✅ Attach all-active CSV ONLY if all-active JSON has rows
  if (hasAll && fs.existsSync(ALL_CSV)) {
    const csvContentAll = fs.readFileSync(ALL_CSV);
    emailLines.push(`--${boundary}`);
    emailLines.push(`Content-Type: text/csv; name="all_tenders.csv"`);
    emailLines.push(`Content-Transfer-Encoding: base64`);
    emailLines.push(`Content-Disposition: attachment; filename="all_tenders.csv"`);
    emailLines.push("");
    emailLines.push(csvContentAll.toString("base64"));
    emailLines.push("");
  }

  emailLines.push(`--${boundary}--`);

  const raw = Buffer.from(emailLines.join("\r\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  try {
    const result = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });
    console.log("✅ Email sent successfully, message ID:", result.data.id);
    console.log(`ℹ️ Attachments: recent=${hasRecent ? "YES" : "NO"}, allActive=${hasAll ? "YES" : "NO"}`);
  } catch (err) {
    console.error("❌ Failed to send email:", err);
  }
}

export default sendEmail;