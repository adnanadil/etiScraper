// translateTenderGoogleX.mjs
import fs from "fs";
import { translate } from "google-translate-api-x";
import { parse } from "json2csv";

const INPUT_FILE = "tenderData/tenders_recent.json";
const OUTPUT_FILE = "tenderData/translated/recent_tenders.json";
const OUTPUT_CSV = "tenderData/translated/recent_tenders.csv";

const INPUT_FILE_AllActive = "tenderData/tenders_all_active.json";
const OUTPUT_FILE_AllActive = "tenderData/translated/all_tenders.json";
const OUTPUT_CSV_AllActive = "tenderData/translated/all_tenders.csv";

async function translateTenderTitles() {
  await translateAndSaveTenders(INPUT_FILE, OUTPUT_FILE, OUTPUT_CSV);
  await translateAndSaveTenders(INPUT_FILE_AllActive, OUTPUT_FILE_AllActive, OUTPUT_CSV_AllActive);
}

async function translateAndSaveTenders(inputFile, outputFile, outputCsv) {
  if (!fs.existsSync(inputFile)) {
    console.log("❌ Input file not found:", inputFile);
    return;
  }

  const tenders = JSON.parse(fs.readFileSync(inputFile, "utf-8"));
  if (!Array.isArray(tenders) || tenders.length === 0) {
    console.log("ℹ️ No tenders to translate (empty array). Writing empty outputs.");
    fs.writeFileSync(outputFile, JSON.stringify([], null, 2), "utf8");
    fs.writeFileSync(outputCsv, "\uFEFF", "utf8");
    return;
  }

  const translatedTenders = [];

  for (const t of tenders) {
    try {
      const titleEn = t.title ? (await translate(t.title, { from: "ar", to: "en" })).text : "";
      const orgEn = t.orgName ? (await translate(t.orgName, { from: "ar", to: "en" })).text : "";
      const subDeptEn = t.subDeptName ? (await translate(t.subDeptName, { from: "ar", to: "en" })).text : "";

      // ✅ Stable JSON schema (camelCase keys)
      translatedTenders.push({
        titleAr: t.title ?? "",
        titleEn,
        orgNameAr: t.orgName ?? "",
        orgNameEn: orgEn,
        subDeptNameAr: t.subDeptName ?? "",
        subDeptNameEn: subDeptEn,

        bidValue: t.bidValue ?? "",
        publishDate: t.publishDate ?? "",
        tenderOpenDays: t.tenderOpenDays ?? "",

        inquiryDeadline: t.inquiryDeadline ?? "",
        inquiryDeadlineDaysLeft: t.inquiryDeadlineDaysLeft ?? "",

        bidDeadline: t.bidDeadline ?? "",
        bidDeadlineTime: t.bidDeadlineTime ?? "",
        bidDeadlineDateTime: t.bidDeadline ? `${t.bidDeadline}${t.bidDeadlineTime ? ` @ ${t.bidDeadlineTime}` : ""}` : "",
        bidDeadlineDaysLeft: t.bidDeadlineDaysLeft ?? "",

        keyword: t.keyword ?? "",
        keywordEng: t.keywordEng ?? "",

        detailUrl: t.detailUrl ?? "",
      });

      console.log(`✅ Translated: ${t.title} -> ${titleEn}`);

      // small delay
      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      console.error("❌ Translation failed for:", t.title, err.message);

      // ✅ Fallback keeps same schema
      translatedTenders.push({
        titleAr: t.title ?? "",
        titleEn: t.title ?? "",
        orgNameAr: t.orgName ?? "",
        orgNameEn: t.orgName ?? "",
        subDeptNameAr: t.subDeptName ?? "",
        subDeptNameEn: t.subDeptName ?? "",

        bidValue: t.bidValue ?? "",
        publishDate: t.publishDate ?? "",
        tenderOpenDays: t.tenderOpenDays ?? "",

        inquiryDeadline: t.inquiryDeadline ?? "",
        inquiryDeadlineDaysLeft: t.inquiryDeadlineDaysLeft ?? "",

        bidDeadline: t.bidDeadline ?? "",
        bidDeadlineTime: t.bidDeadlineTime ?? "",
        bidDeadlineDateTime: t.bidDeadline ? `${t.bidDeadline}${t.bidDeadlineTime ? ` @ ${t.bidDeadlineTime}` : ""}` : "",
        bidDeadlineDaysLeft: t.bidDeadlineDaysLeft ?? "",

        keyword: t.keyword ?? "",
        keywordEng: t.keywordEng ?? "",

        detailUrl: t.detailUrl ?? "",
      });
    }
  }

  // Save JSON
  fs.writeFileSync(outputFile, JSON.stringify(translatedTenders, null, 2), "utf8");
  console.log(`💾 Saved translated tenders to ${outputFile}`);

  // Save CSV with pretty headers (labels)
  try {
    const fields = [
      { label: "Title (English)", value: "titleEn" },
      { label: "Organization (English)", value: "orgNameEn" },
      { label: "Organization Sub Department (English)", value: "subDeptNameEn" },

      { label: "Tender Doc Purc Value", value: "bidValue" },
      { label: "Published Date", value: "publishDate" },
      { label: "Tender Open Days", value: "tenderOpenDays" },

      { label: "Inquiry Deadline", value: "inquiryDeadline" },
      { label: "Days Left to Send Inquiries", value: "inquiryDeadlineDaysLeft" },

      { label: "Bid Deadline Date and Time", value: "bidDeadlineDateTime" },
      { label: "Days left Until Bid Closing", value: "bidDeadlineDaysLeft" },

      { label: "Keyword (English)", value: "keywordEng" },
      { label: "keywords", value: "keyword" },

      { label: "Detail Url", value: "detailUrl" },

      { label: "Title (Arabic)", value: "titleAr" },
    ];

    const csv = parse(translatedTenders, { fields });
    fs.writeFileSync(outputCsv, "\uFEFF" + csv, "utf8");
    console.log(`💾 Saved translated tenders to ${outputCsv}`);
  } catch (err) {
    console.error("❌ Failed to create CSV:", err.message);
  }
}

export default translateTenderTitles;