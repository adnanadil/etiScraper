// translateTenderGoogleX.mjs
import fs from "fs";
import { translate } from "google-translate-api-x"; // npm install google-translate-api-x
import { parse } from "json2csv";

// const INPUT_FILE = "tenderData/tenders_recent.json";
// const INPUT_FILE = "tenderData/tenders_all.json";
const INPUT_FILE = "tenderData/tenders_all_active.json";
const OUTPUT_FILE = "tenders_translated.json";
const OUTPUT_CSV = "tenders_translated.csv";

async function translateTenderTitles() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.log("❌ Input file not found:", INPUT_FILE);
    return;
  }

  const tenders = JSON.parse(fs.readFileSync(INPUT_FILE, "utf-8"));
  const translatedTenders = [];

  for (const t of tenders) {
    try {
      const translatedText = await translate(t.title, { from: "ar", to: "en" });
      const keywordEng = await translate(t.keyword, { from: "ar", to: "en" });
      const organizationEng = await translate(t.orgName, { from: "ar", to: "en" });
      const organizationSubDeptEng = await translate(t.subDeptName, { from: "ar", to: "en" });

      translatedTenders.push({
        "Title (English Translation)": translatedText.text,
        "Organization (English Translation)": organizationEng.text,
        "Organization Sub Department (English Translation)": organizationSubDeptEng.text,
        "Tender Value": t.bidValue,
        "Published Date": t.publishDate,
        "Inquiry Deadline": t.inquiryDeadline,
        "Days Left to Send Inquiries": t.inquiryDeadlineDaysLeft,
        "Bid Deadline Date and Time": `${t.bidDeadline} @ ${t.bidDeadlineTime}`,
        "Days left Until Bid Closing": t.bidDeadlineDaysLeft,
        "Keyword (English Translation)": keywordEng.text,
        "Detail Url": t.detailUrl,
        "Title (Arabic)": t.title,
        keywords: t.keyword
      });

      console.log(`✅ Translated: ${t.title} -> ${translatedText.text}`);

      // Small delay to avoid overloading free service
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (err) {
      console.error("❌ Translation failed for:", t.title, err.message);

      translatedTenders.push({
        "Title (Arabic)": t.title,
        "Title (English Translation)": t.title, // fallback
        "Published Date": t.publishDate,
        "Inquiry Deadline": t.inquiryDeadline,
        "Bid Deadline": t.bidDeadline,
        "Detail Url": t.detailUrl,
        keywords: t.keyword
      });
    }
  }

  // Save JSON
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(translatedTenders, null, 2));
  console.log(`💾 Saved translated tenders to ${OUTPUT_FILE}`);

  // Save CSV
  try {
    const csv = parse(translatedTenders);
    // fs.writeFileSync(OUTPUT_CSV, csv);
    fs.writeFileSync(OUTPUT_CSV, '\uFEFF' + csv, "utf8");

    console.log(`💾 Saved translated tenders to ${OUTPUT_CSV}`);
  } catch (err) {
    console.error("❌ Failed to create CSV:", err.message);
  }
}

// translateTenders();

export default translateTenderTitles