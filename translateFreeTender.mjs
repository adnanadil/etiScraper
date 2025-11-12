// translateTenderGoogleX.mjs
import fs from "fs";
import { translate } from "google-translate-api-x"; // npm install google-translate-api-x
import { parse } from "json2csv";

const INPUT_FILE = "tenderData/tenders_recent.json";
const OUTPUT_FILE = "tenders_translated.json";
const OUTPUT_CSV = "tenders_translated.csv";

async function translateTenders() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.log("❌ Input file not found:", INPUT_FILE);
    return;
  }

  const tenders = JSON.parse(fs.readFileSync(INPUT_FILE, "utf-8"));
  const translatedTenders = [];

  for (const t of tenders) {
    try {
      const translatedText = await translate(t.title, { from: "ar", to: "en" });

      translatedTenders.push({
        "Title (Arabic)": t.title,
        "Title (English Translation)": translatedText.text,
        "Published Date": t.publishDate,
        "Inquiry Deadline": t.inquiryDeadline,
        "Bid Deadline": t.bidDeadline,
        "Detail Url": t.detailUrl
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
        "Detail Url": t.detailUrl
      });
    }
  }

  // Save JSON
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(translatedTenders, null, 2));
  console.log(`💾 Saved translated tenders to ${OUTPUT_FILE}`);

  // Save CSV
  try {
    const csv = parse(translatedTenders);
    fs.writeFileSync(OUTPUT_CSV, csv);
    console.log(`💾 Saved translated tenders to ${OUTPUT_CSV}`);
  } catch (err) {
    console.error("❌ Failed to create CSV:", err.message);
  }
}

translateTenders();