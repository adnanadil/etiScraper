import express from "express";
import cron from "node-cron";
import fs from "fs";

import scraperWithFilter from "./scraperWithFilter.mjs";
import translateTenderTitles from "./translateTenderTitles.mjs";
import sendEmail from "./sendEmail.mjs";
//import sendEmailOld from "./sendEmailOld.mjs";

// Detect environment
const isLocal = process.env.NODE_ENV !== "production";

const app = express();
const PORT = process.env.PORT || 8080;


// Email recipients
const TO_EMAILS = isLocal
  ? [
      "adnanadil529@gmail.com",
      "adnan.adil@stengg.com",
    ] // 👈 Local testing emails
  : (process.env.TO_EMAILS || "")
      .split(",")
      .map(e => e.trim())
      .filter(Boolean);

if (!TO_EMAILS.length) {
  console.warn("⚠️ WARNING: No recipient emails configured");
}

// Test route
app.get("/", (req, res) => res.send("Etimad Tender Scraper is running!"));

let isRunning = false;

// Prevent overlapping runs from cloud scheduler or manual triggers
app.get("/run", async (req, res) => {
  if (process.env.RUN_KEY && req.query.key !== process.env.RUN_KEY) {
    return res.status(401).send("Unauthorized");
  }

  if (isRunning) {
    return res.status(429).send("Already running");
  }

  isRunning = true;
  try {
    await automate();
    res.send("✅ Tender workflow completed successfully");
  } catch (err) {
    console.error("❌ Error in tender workflow:", err);
    res.status(500).send("❌ Error in tender workflow: " + err.message);
  } finally {
    isRunning = false;
  }
});

app.get("/tenders", (req, res) => {
  const FILE_PATH = "tenderData/translated/all_tenders_translated.json";

  // Check if file exists
  if (!fs.existsSync(FILE_PATH)) {
    return res.status(404).json({ error: "File not found" });
  }

  try {
    const data = fs.readFileSync(FILE_PATH, "utf-8");
    const jsonData = JSON.parse(data); // parse the JSON
    res.json(jsonData); // send as JSON response
  } catch (err) {
    console.error("Error reading JSON file:", err);
    res.status(500).json({ error: "Failed to read file" });
  }
});

app.get("/all-tenders", (req, res) => {
  const FILE_PATH = "tenderData/tenders_all.json";

  // Check if file exists
  if (!fs.existsSync(FILE_PATH)) {
    return res.status(404).json({ error: "File not found" });
  }

  try {
    const data = fs.readFileSync(FILE_PATH, "utf-8");
    const jsonData = JSON.parse(data); // parse the JSON
    res.json(jsonData); // send as JSON response
  } catch (err) {
    console.error("Error reading JSON file:", err);
    res.status(500).json({ error: "Failed to read file" });
  }
});


// Workflow function 
/*
const automate = async () => {
  try {
    console.log(new Date().toLocaleString(), "⏰ Starting tender workflow...");
    await scraperWithFilter();
    await translateTenderTitles();
    // await sendEmail(["adnanadil529@gmail.com", "adnan.adil@stengg.com", "leem.sauhwee@stengg.com"]);
    await sendEmail(["adnanadil529@gmail.com", "adnan.adil@stengg.com"]);
    console.log(new Date().toLocaleString(), "✅ Tender workflow completed successfully");
  } catch (err) {
    console.error(new Date().toLocaleString(), "❌ Error in tender workflow:", err);
  }
};
*/

const automate = async () => {
  console.log(new Date().toLocaleString(), "⏰ Starting tender workflow...");
  await scraperWithFilter();
  await translateTenderTitles();
  // await sendEmail(["adnanadil529@gmail.com", "adnan.adil@stengg.com", "leem.sauhwee@stengg.com"]);
  // await sendEmail(["adnanadil529@gmail.com", "adnan.adil@stengg.com"]);
  // await sendEmail(TO_EMAILS);
  await sendEmail(TO_EMAILS);
  console.log(new Date().toLocaleString(), "✅ Tender workflow completed successfully");
};


// Cron job: run daily at 08:00 AM
if (process.env.ENABLE_LOCAL_CRON === "true") {
  cron.schedule(
    "0 8 * * *",
    async () => {
      if (isRunning) {
        console.log("⏳ Skipping cron run (already running)");
        return;
      }
      isRunning = true;
      try {
        await automate();
      } catch (err) {
        console.error("❌ Cron run failed:", err);
      } finally {
        isRunning = false;
      }
    },
    { timezone: "Asia/Riyadh" }
  );
}

// Start Express server
app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Server running on port ${PORT}`));