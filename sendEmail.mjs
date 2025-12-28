// sendEmail.mjs
import "dotenv/config";
import fs from "fs";
import path from "path";
import { google } from "googleapis";
import { jsonToExcel } from "./jsonToExcel.mjs";

// ----------------------
// Secret paths (Cloud Run) + local fallback
// ----------------------
const CREDENTIALS_PATH =
  process.env.GMAIL_CREDENTIALS_PATH || "/secrets/gmail-credentials/credentials.json";

const TOKEN_PATH =
  process.env.GMAIL_TOKEN_PATH || "/secrets/gmail-token/token.json";

// ----------------------
// Translated JSON paths (camelCase schema from your translate file)
// ----------------------
// const RECENT_JSON = "tenderData/translated/all_tenders.json";
const RECENT_JSON = "tenderData/translated/recent_tenders.json";
const ALL_JSON = "tenderData/translated/all_tenders.json";

// Excel output paths
const RECENT_XLSX = "tenderData/translated/recent_tenders.xlsx";
const ALL_XLSX = "tenderData/translated/all_tenders.xlsx";

// ----------------------
// Helpers
// ----------------------
function safeReadJsonArray(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function ensureDirForFile(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function escapeHtml(v) {
  const s = String(v ?? "");
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// RFC 2045 base64 line wrapping (important for Gmail)
function toBase64Lines(buffer) {
  return buffer
    .toString("base64")
    .match(/.{1,76}/g)
    .join("\r\n");
}

// Plain text fallback for Gmail/clients that prefer text/plain
function toPlainText(rows) {
  if (!rows || rows.length === 0) return "No new tenders today.";
  return rows
    .slice(0, 30)
    .map((r) => {
      const title = r.titleEn || r.titleAr || "Tender";
      const org = r.orgNameEn || r.orgNameAr || "";
      const url = r.detailUrl || "";
      return `- ${title}${org ? ` | ${org}` : ""}${url ? ` | ${url}` : ""}`;
    })
    .join("\n");
}

// ✅ HTML table with widths + nowrap for date/time columns
function jsonToTableWithColumns(rows, columns, centerKeys, noWrapKeys = []) {
  if (!rows || rows.length === 0) return "<p>No tenders found.</p>";

  const tableStyle =
    "border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:12px;table-layout:fixed;";
  const thBase =
    "border:1px solid #ccc;padding:6px;background:#f5f5f5;text-align:center;vertical-align:middle;";
  const tdBase =
    "border:1px solid #ccc;padding:6px;vertical-align:middle;overflow:hidden;text-overflow:ellipsis;";

  let html = `<table style="${tableStyle}">`;
  html += "<thead><tr>";

  for (const c of columns) {
    const width = c.width || "140px";
    html += `<th style="${thBase}width:${width};">${escapeHtml(c.header)}</th>`;
  }

  html += "</tr></thead><tbody>";

  for (const r of rows) {
    html += "<tr>";

    for (const c of columns) {
      const width = c.width || "140px";
      const val = r?.[c.key] ?? "";
      const align = centerKeys.includes(c.key) ? "text-align:center;" : "text-align:left;";
      const nowrap = noWrapKeys.includes(c.key) ? "white-space:nowrap;" : "white-space:normal;";

      if (c.key === "detailUrl" && val) {
        html += `<td style="${tdBase}${align}${nowrap}width:${width};">
          <a href="${escapeHtml(val)}" target="_blank">${escapeHtml(val)}</a>
        </td>`;
      } else {
        html += `<td style="${tdBase}${align}${nowrap}width:${width};">${escapeHtml(val)}</td>`;
      }
    }

    html += "</tr>";
  }

  html += "</tbody></table>";
  return html;
}

// ----------------------
// Column definitions — matches your translated JSON keys
// NOTE: You wanted Tender Type/Core Activity just before keywords
// ----------------------
const columns = [
  { header: "Title (English)", key: "titleEn", width: "260px" },
  { header: "Organization (English)", key: "orgNameEn", width: "150px" },
  { header: "Organization Sub Department (English)", key: "subDeptNameEn", width: "150px" },

  { header: "Tender Doc Purc Value", key: "bidValue", width: "110px" },
  { header: "Published Date", key: "publishDate", width: "110px" },
  { header: "Tender Open Days", key: "tenderOpenDays", width: "90px" },

  { header: "Inquiry Deadline", key: "inquiryDeadline", width: "110px" },
  { header: "Days Left to Send Inquiries", key: "inquiryDeadlineDaysLeft", width: "140px" },

  { header: "Bid Deadline Date and Time", key: "bidDeadlineDateTime", width: "180px" },
  { header: "Days left Until Bid Closing", key: "bidDeadlineDaysLeft", width: "150px" },

  // ✅ NEW fields placed before keywords (as requested)
  { header: "Tender Type (English)", key: "tenderTypeEn", width: "140px" },
  { header: "Core Activity (English)", key: "coreActivitiesEn", width: "160px" },

  { header: "Keyword (English)", key: "keywordEng", width: "100px" },
  { header: "keywords", key: "keyword", width: "100px" },

  { header: "Detail Url", key: "detailUrl", width: "260px" },

  // Optional Arabic fields at end
  { header: "Tender Type (Arabic)", key: "tenderTypeAr", width: "160px" },
  { header: "Core Activity (Arabic)", key: "coreActivitiesAr", width: "180px" },
  { header: "Title (Arabic)", key: "titleAr", width: "240px" },
];

// Center ONLY the columns you asked for (+ keep new ones centered if you want)
const centerColumnKeys = [
  "bidValue",
  "publishDate",
  "tenderOpenDays",
  "inquiryDeadline",
  "inquiryDeadlineDaysLeft",
  "bidDeadlineDateTime",
  "bidDeadlineDaysLeft",
  "keywordEng",
  "keyword",
];

// Make sure date/time columns never wrap in email table
const noWrapKeys = ["publishDate", "inquiryDeadline", "bidDeadlineDateTime"];

// ----------------------
// Gmail client init (reads secrets)
// ----------------------
function makeGmailClient() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));

  const { client_id, client_secret, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  oAuth2Client.setCredentials(token);

  return google.gmail({ version: "v1", auth: oAuth2Client });
}

// ----------------------
// Main send function
// ----------------------
async function sendEmail(toEmails = []) {
  const gmail = makeGmailClient();

  const recentData = safeReadJsonArray(RECENT_JSON);
  const allData = safeReadJsonArray(ALL_JSON);

  const hasRecent = recentData.length > 0;
  const hasAll = allData.length > 0;

  ensureDirForFile(RECENT_XLSX);
  ensureDirForFile(ALL_XLSX);

  // Build XLSX attachments (full data)
  if (hasRecent) {
    await jsonToExcel({
      jsonPath: RECENT_JSON,
      xlsxPath: RECENT_XLSX,
      sheetName: "Recent Tenders",
      columns,
      centerColumnKeys,
      minWidth: 12,
      maxWidth: 60,
      padding: 2,
    });
  }

  if (hasAll) {
    await jsonToExcel({
      jsonPath: ALL_JSON,
      xlsxPath: ALL_XLSX,
      sheetName: "All Active",
      columns,
      centerColumnKeys,
      minWidth: 12,
      maxWidth: 60,
      padding: 2,
    });
  }

  // Gmail body: keep it smaller (preview only)
  const recentPreview = hasRecent ? recentData.slice(0, 25) : [];
  const plainBody = toPlainText(recentPreview);

  let htmlBody = `<div style="font-family:Arial,sans-serif;font-size:13px;">`;
  htmlBody += `<h2>Latest Tenders Update</h2>`;

  if (!hasRecent) {
    htmlBody += `<p><b>No New Tenders Today Matching Our Keywords.</b></p>`;
  } else {
    htmlBody += `<h3>New Tenders Today Matching Our Keywords (Top ${recentPreview.length})</h3>`;
    htmlBody += jsonToTableWithColumns(recentPreview, columns, centerColumnKeys, noWrapKeys);
    if (recentData.length > recentPreview.length) {
      htmlBody += `<p><i>Showing ${recentPreview.length} of ${recentData.length}. Full list is in the Excel attachment.</i></p>`;
    }
  }

  const attachmentNote = [];
  if (hasRecent) attachmentNote.push("recent_tenders.xlsx");
  if (hasAll) attachmentNote.push("all_tenders.xlsx");
  if (attachmentNote.length) {
    htmlBody += `<p><i>Attachments: ${attachmentNote.join(", ")}</i></p>`;
  }
  htmlBody += `</div>`;

  // ----------------------
  // ✅ Correct MIME: multipart/mixed -> multipart/alternative -> attachments
  // ----------------------
  const boundary = "----=_NodeMailBoundary";
  const altBoundary = "----=_NodeMailAltBoundary";

  const emailLines = [];
  emailLines.push(`From: "Tenders Bot" <me>`);
  emailLines.push(`To: ${toEmails.join(", ")}`);
  emailLines.push(`Subject: Latest Tenders`);
  emailLines.push(`MIME-Version: 1.0`);
  emailLines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  emailLines.push("");

  // multipart/alternative container
  emailLines.push(`--${boundary}`);
  emailLines.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
  emailLines.push("");

  // text/plain
  emailLines.push(`--${altBoundary}`);
  emailLines.push(`Content-Type: text/plain; charset=UTF-8`);
  emailLines.push(`Content-Transfer-Encoding: 7bit`);
  emailLines.push("");
  emailLines.push(plainBody);
  emailLines.push("");

  // text/html
  emailLines.push(`--${altBoundary}`);
  emailLines.push(`Content-Type: text/html; charset=UTF-8`);
  emailLines.push(`Content-Transfer-Encoding: 7bit`);
  emailLines.push("");
  emailLines.push(`<!doctype html><html><body>${htmlBody}</body></html>`);
  emailLines.push("");

  // close alternative
  emailLines.push(`--${altBoundary}--`);
  emailLines.push("");

  // Attach recent XLSX
  if (hasRecent && fs.existsSync(RECENT_XLSX)) {
    const xlsx = fs.readFileSync(RECENT_XLSX);
    emailLines.push(`--${boundary}`);
    emailLines.push(
      `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; name="recent_tenders.xlsx"`
    );
    emailLines.push(`Content-Transfer-Encoding: base64`);
    emailLines.push(`Content-Disposition: attachment; filename="recent_tenders.xlsx"`);
    emailLines.push("");
    emailLines.push(toBase64Lines(xlsx));
    emailLines.push("");
  }

  // Attach all XLSX
  if (hasAll && fs.existsSync(ALL_XLSX)) {
    const xlsx = fs.readFileSync(ALL_XLSX);
    emailLines.push(`--${boundary}`);
    emailLines.push(
      `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; name="all_tenders.xlsx"`
    );
    emailLines.push(`Content-Transfer-Encoding: base64`);
    emailLines.push(`Content-Disposition: attachment; filename="all_tenders.xlsx"`);
    emailLines.push("");
    emailLines.push(toBase64Lines(xlsx));
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
    console.log(
      `ℹ️ Attachments: recent=${hasRecent ? "YES" : "NO"}, allActive=${hasAll ? "YES" : "NO"}`
    );
  } catch (err) {
    console.error("❌ Failed to send email:", err?.message || err);
  }
}

export default sendEmail;