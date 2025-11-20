import express from "express";
import cron from "node-cron";

import scraperWithFilter from "./scraperWithFilter.mjs";
import translateTenderTitles from "./translateTenderTitles.mjs";
import sendEmail from "./sendEmail.mjs";

const app = express();
const PORT = process.env.PORT || 3000;

// Test route
app.get("/", (req, res) => res.send("Etimad Tender Scraper is running!"));

app.get("/run", async (req,res) => {
  try {
    await automate()
    res.send("✅ Tender workflow completed successfully");
  }catch(err) {
    console.error("❌ Error in tender workflow:", err);
    res.status(500).send("❌ Error in tender workflow: " + err.message);
  }
})

app.get("/tenders", (req, res) => {
  const FILE_PATH = "tenders_translated.json";

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

// Cron job: run daily at 08:00 AM
cron.schedule("0 8 * * *", async () => {
  await automate();
}, {
  timezone: "Asia/Riyadh"
});

// Start Express server
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));