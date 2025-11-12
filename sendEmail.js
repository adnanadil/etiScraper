const fs = require("fs");
const { google } = require("googleapis");
const path = require("path");

// Paths
const CREDENTIALS_PATH = "credentials.json";
const TOKEN_PATH = "token.json";
const CSV_FILE_PATH = "tenders_translated.csv";
const JSON_FILE_PATH = "tenders_translated.json";

// Load credentials and token
const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
const token = JSON.parse(fs.readFileSync(TOKEN_PATH));

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
    headers.forEach(h => (table += `<td>${row[h]}</td>`));
    table += "</tr>";
  });

  table += "</tbody></table>";
  return table;
}

async function sendTenderEmail(toEmails = []) {
  const jsonData = JSON.parse(fs.readFileSync(JSON_FILE_PATH));
  const htmlTable = jsonToTable(jsonData);
  const csvContent = fs.readFileSync(CSV_FILE_PATH);

  const boundary = "----=_NodeMailBoundary";

  const emailLines = [];
  emailLines.push(`From: 'Tenders Bot' <your-email@gmail.com>`);
  emailLines.push(`To: ${toEmails.join(", ")}`);
  emailLines.push("Subject: Latest Tenders");
  emailLines.push(`MIME-Version: 1.0`);
  emailLines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  emailLines.push("");
  emailLines.push(`--${boundary}`);
  emailLines.push(`Content-Type: text/html; charset=UTF-8`);
  emailLines.push("");
  emailLines.push(`<h2>Latest Tenders</h2>`);
  emailLines.push(htmlTable);
  emailLines.push("");
  emailLines.push(`--${boundary}`);
  emailLines.push(`Content-Type: text/csv; name="tenders_all.csv"`);
  emailLines.push("Content-Transfer-Encoding: base64");
  emailLines.push(`Content-Disposition: attachment; filename="tenders_all.csv"`);
  emailLines.push("");
  emailLines.push(csvContent.toString("base64"));
  emailLines.push(`--${boundary}--`);

  const raw = Buffer.from(emailLines.join("\r\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  try {
    const result = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw,
      },
    });
    console.log("✅ Email sent successfully, message ID:", result.data.id);
  } catch (err) {
    console.error("❌ Failed to send email:", err);
  }
}

// Example usage
sendTenderEmail(["adnanadil529@gmail.com", "adnan.adil@stengg.com"]);