import puppeteer from "puppeteer";
import fs from "fs";
import { Parser } from "json2csv";
import { Storage } from "@google-cloud/storage";

import keywords from "./keywords.mjs"; // your keywords object

const parser = new Parser(); // kept (no breaking change)

// ✅ Works on all Node/Puppeteer versions (replaces page.waitForTimeout)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const storage = new Storage();
const bucketName = process.env.GCLOUD_STORAGE_BUCKET || "etimad-tenders-data";
const bucket = storage.bucket(bucketName);
const SENT_FILE = "tenderData/tenders_sent.json";
const GCS_FILE = "tenders_sent.json"; // file in GCS to track sent tenders

async function scraperWithFilter() {
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote",
      "--single-process",
    ],
  });

  const page = await browser.newPage();

  // Helps clickability/layout consistency in headless
  await page.setViewport({ width: 1366, height: 768 });

  // Prevent indefinite hangs
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(90000);

  const url = "https://tenders.etimad.sa/Tender/AllTendersForVisitor";

  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });

  // Wait for JS rendering after initial load
  await sleep(3000);

  const allTenders = [];

  // 1️⃣ Dropdown: select last option (more items per page)
  const itemsDropdownSelector = "#itemsPerPage";
  const itemsDropdown = await page.$(itemsDropdownSelector);
  if (itemsDropdown) {
    console.log("Dropdown found, selecting last option...");

    await page.evaluate(() => {
      const select = document.querySelector("#itemsPerPage");
      const options = select?.querySelectorAll("option");
      const lastOption = options?.[options.length - 1];
      if (select && lastOption) {
        lastOption.selected = true;
        select.dispatchEvent(new Event("change"));
      }
    });

    await sleep(3000);
  } else {
    console.log("❌ Items dropdown not found");
  }

  // Reveal search box
  const searchToggleSelector = "#searchBtnColaps";
  try {
    await page.waitForSelector(searchToggleSelector, { timeout: 60000 });
    console.log("Search button found, clicking to reveal search box...");

    // Click using page.click (works most of the time)
    await page.click(searchToggleSelector).catch(() => null);
    await sleep(2000);
  } catch (e) {
    console.log("❌ Search button not clickable or not found:", e.message);
    await browser.close();
    return;
  }

  // Search for the search box (Cloud Run safe)
  const searchBoxSelector = "#txtMultipleSearch";
  let searchBox;

  try {
    await sleep(1500);

    // Click toggle again just in case (safe if already open)
    await page.click(searchToggleSelector).catch(() => null);
    await sleep(1000);

    // Wait for element to EXIST (not visible)
    await page.waitForSelector(searchBoxSelector, { timeout: 60000 });

    // Scroll into view + focus
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) {
        el.scrollIntoView({ block: "center" });
        el.focus();
      }
    }, searchBoxSelector);

    // Best-effort click
    await page.click(searchBoxSelector).catch(() => null);

    searchBox = await page.$(searchBoxSelector);

    if (!searchBox) {
      throw new Error("Search box handle is null");
    }

    console.log("✅ Search box ready");
  } catch (e) {
    console.error("❌ Search box not found/clickable:", e.message);
    await browser.close();
    return;
  }

  const delay = (ms) => sleep(ms);

  // Loop through keywords
  for (const [keyword, englishKeyword] of Object.entries(keywords)) {
    if (!searchBox) {
      console.log("❌ Search box not found (unexpected)");
      break;
    }

    console.log(`Filling search box with keyword: ${keyword}`);

    // ✅ Cloud-safe: set input value via DOM (no click)
    try {
      await page.evaluate(
        (sel, value) => {
          const el = document.querySelector(sel);
          if (!el) throw new Error("Search box not found in DOM");
          el.value = "";
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));

          el.value = value;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        },
        searchBoxSelector,
        keyword
      );
    } catch (e) {
      console.log(`❌ Failed setting keyword "${keyword}" in search box:`, e.message);
      continue;
    }

    await delay(500 + Math.random() * 500);

    // Apply search
    const applySelector = "#searchBtn";
    try {
      await page.waitForSelector(applySelector, { timeout: 60000 });
      console.log("Clicking search button to apply filter...");

      // ✅ DOM click (stable in headless)
      await page.evaluate((sel) => {
        const btn = document.querySelector(sel);
        if (!btn) throw new Error("Apply search button not found");
        btn.scrollIntoView({ block: "center" });
        btn.click();
      }, applySelector);

      // Wait for results to update
      await delay(3500 + Math.random() * 2000);

      const tenderElements = await page.$$(".col-12.col-md-12.mb-4");
      console.log(`✅ Found ${tenderElements.length} tenders for keyword: ${keyword}`);

      await tenderData(keyword, page, allTenders, englishKeyword);

      console.log("⏳ Waiting before next keyword...");
      await delay(2500 + Math.random() * 2500);
    } catch (e) {
      console.log(`❌ Failed applying search for keyword "${keyword}":`, e.message);
      continue;
    }
  }

  // After all keywords are processed, save the info in the final file.
  if (allTenders.length > 0) {
    const fields = [
      "title",
      "orgName",
      "subDeptName",
      "bidValue",
      "publishDate",
      "detailUrl",
      "inquiryDeadline",
      "bidDeadline",
      "bidDeadlineTime",
      "bidDeadlineDaysLeft",
      "inquiryDeadlineDaysLeft",
      "keyword",
      "keywordEng",
      "tenderOpenDays",
    ];
    const finalParser = new Parser({ fields });

    const allTendersMap = new Map();
    allTenders.forEach((t) => allTendersMap.set(t.detailUrl, t));
    const allTendersUnique = Array.from(allTendersMap.values());

    fs.writeFileSync(
      "tenderData/tenders_all.csv",
      "\uFEFF" + finalParser.parse(allTendersUnique),
      "utf8"
    );
    fs.writeFileSync("tenderData/tenders_all.json", JSON.stringify(allTendersUnique, null, 2));
    console.log("✅ Scraping complete! Total tenders scraped:", allTendersUnique.length);

    // Helper to format date as `YYYY-MM-DD`
    const formatDateISO = (date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    };

    const today = new Date();
    const todayFormatted = formatDateISO(today);

    const activeTendersMap = new Map();
    allTendersUnique.forEach((t) => {
      if (t.bidDeadline && t.bidDeadline >= todayFormatted) {
        activeTendersMap.set(t.detailUrl, t);
      }
    });

    const ACTIVE_TENDERS_JSON = "tenderData/tenders_all_active.json";
    const ACTIVE_TENDERS_CSV = "tenderData/tenders_all_active.csv";

    const allTendersNotExpired = Array.from(activeTendersMap.values());
    fs.writeFileSync(
      ACTIVE_TENDERS_CSV,
      "\uFEFF" + finalParser.parse(allTendersNotExpired),
      "utf8"
    );
    fs.writeFileSync(ACTIVE_TENDERS_JSON, JSON.stringify(allTendersNotExpired, null, 2));
    console.log("✅ Scraping complete! Total tenders scraped:", allTendersNotExpired.length);

    // Download sent file from GCS if it exists, else create empty
    const gcsSentFile = bucket.file(GCS_FILE);
    const [exists] = await gcsSentFile.exists();

    if (exists) {
      await gcsSentFile.download({ destination: SENT_FILE });
      console.log("✅ Downloaded sent tenders file from GCS");
    } else {
      console.log("ℹ️ No sent file found in GCS. Creating fresh one.");
      fs.writeFileSync(SENT_FILE, "[]", "utf8");
    }

    let sentTenders = JSON.parse(fs.readFileSync(SENT_FILE));

    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const todayStr = formatDateISO(today);
    const yesterdayStr = formatDateISO(yesterday);

    // NOTE: If publishDate from site is not ISO, recent tenders may be empty (we can normalize later)
    const recentTendersRaw = allTendersUnique.filter(
      (t) =>
        (t.publishDate === todayStr || t.publishDate === yesterdayStr) &&
        !sentTenders.some((sent) => sent.detailUrl === t.detailUrl)
    );

    const recentTendersMap = new Map();
    recentTendersRaw.forEach((t) => recentTendersMap.set(t.detailUrl, t));
    const recentTenders = Array.from(recentTendersMap.values());

    recentTenders.sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate));

    console.log(`ℹ️ Found ${recentTenders.length} tenders from today or yesterday (excluding already sent)`);

    if (recentTenders.length > 0) {
      const fields = [
        "title",
        "orgName",
        "subDeptName",
        "bidValue",
        "publishDate",
        "detailUrl",
        "inquiryDeadline",
        "bidDeadline",
        "bidDeadlineTime",
        "bidDeadlineDaysLeft",
        "inquiryDeadlineDaysLeft",
        "keyword",
        "tenderOpenDays",
      ];
      const parserRecent = new Parser({ fields });

      fs.writeFileSync("tenderData/tenders_recent.json", JSON.stringify(recentTenders, null, 2));
      fs.writeFileSync(
        "tenderData/tenders_recent.csv",
        "\uFEFF" + parserRecent.parse(recentTenders),
        "utf8"
      );

      recentTenders.forEach((t) => sentTenders.push(t));
      fs.writeFileSync(SENT_FILE, JSON.stringify(sentTenders, null, 2));

      console.log("💾 Saved recent tenders (today + yesterday) to JSON and CSV, updated sent tenders");
    } else {
      const fields = [
        "title",
        "orgName",
        "subDeptName",
        "bidValue",
        "publishDate",
        "detailUrl",
        "inquiryDeadline",
        "bidDeadline",
        "bidDeadlineTime",
        "bidDeadlineDaysLeft",
        "inquiryDeadlineDaysLeft",
        "keyword",
        "tenderOpenDays",
      ];
      const parserRecent = new Parser({ fields });
      fs.writeFileSync("tenderData/tenders_recent.json", JSON.stringify([], null, 2));
      fs.writeFileSync("tenderData/tenders_recent.csv", "\uFEFF" + parserRecent.parse([]), "utf8");
      console.log("ℹ️ No recent tenders found for today/yesterday (or all already sent).");
    }

    // ✅ Always upload sent file so GCS is updated
    try {
      await bucket.upload(SENT_FILE, { destination: GCS_FILE });
      console.log("✅ Uploaded sent tenders file back to GCS:", `gs://${bucketName}/${GCS_FILE}`);
    } catch (e) {
      console.error("❌ Failed to upload sent file to GCS:", e.message);
    }

    await browser.close();
  } else {
    console.log("ℹ️ No tenders found for any keyword, skipping CSV/JSON creation");
    await browser.close();
  }
}

const tenderData = async (keyword, page, allTenders, englishKeyword) => {
  let currentPage = 1;
  const maxPages = 100;
  const allTendersForKeyword = [];

  while (currentPage <= maxPages) {
    console.log(`📄 Scraping Page: ${currentPage} for keyword ${keyword}`);

    const tenders = await page.evaluate((kw, kwEng) => {
      return Array.from(document.querySelectorAll(".col-12.col-md-12.mb-4")).map((t) => {
        const title = t.querySelector("a")?.innerText.trim() || "";
        const publishDate = t.querySelector("div.col-6 span")?.innerText.trim() || "";
        const detailUrl = t.querySelector("a")?.href || "";

        const orgContainer = t.querySelector(".col-12 p.pb-2");
        let orgName = "";
        let subDeptName = "";

        if (orgContainer) {
          const text = orgContainer.innerText.trim();
          const parts = text.split("-");
          orgName = parts[0]?.trim() || "";
          if (parts.length > 1) {
            subDeptName = parts.slice(1).join(" - ").replace("التفاصيل", "").trim();
          } else {
            subDeptName = "";
          }
        }

        const bidValueContainer = t.querySelector(".text-center.mb-3 span");
        const rawBidValue = bidValueContainer?.innerText.trim() || "";
        const bidValue = rawBidValue.includes("مجانا") ? "Free" : rawBidValue.replace(/[^\d]/g, "");

        const dateDivs = t.querySelectorAll(".tender-date .col-12.col-md-3");

        let inquiryDeadline = "";
        let bidDeadline = "";
        let bidDeadlineTime = "";

        dateDivs.forEach((d) => {
          const label = d.querySelector("label")?.innerText.trim() || "";
          if (label.includes("آخر موعد لإستلام الإستفسارات")) {
            inquiryDeadline = d.querySelector("span")?.innerText.trim() || "";
          } else if (label.includes("آخر موعد لتقديم العروض")) {
            const spans = d.querySelectorAll(":scope > span > span");
            bidDeadline = spans[0]?.innerText.trim() || "";
            bidDeadlineTime = spans[1]?.innerText.trim() || "";
          }
        });

        let tenderOpenDays = "";
        let bidDeadlineDaysLeft = "";
        let inquiryDeadlineDaysLeft = "";

        const today = new Date();

        if (bidDeadline) {
          const bidDeadlineCombined = bidDeadlineTime
            ? new Date(`${bidDeadline}T${bidDeadlineTime}:00`)
            : new Date(bidDeadline);

          if (!isNaN(bidDeadlineCombined)) {
            const diffMs = bidDeadlineCombined - today;
            bidDeadlineDaysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

            const publishDateObj = new Date(publishDate);
            if (!isNaN(publishDateObj)) {
              const openDiffMs = bidDeadlineCombined - publishDateObj;
              tenderOpenDays = Math.ceil(openDiffMs / (1000 * 60 * 60 * 24));
            }
          } else {
            bidDeadlineDaysLeft = null;
          }
        }

        if (inquiryDeadline) {
          const inquiryDeadlineCombined = new Date(inquiryDeadline);
          if (!isNaN(inquiryDeadlineCombined)) {
            const diffMsInquiry = inquiryDeadlineCombined - today;
            inquiryDeadlineDaysLeft = Math.ceil(diffMsInquiry / (1000 * 60 * 60 * 24));
          } else {
            inquiryDeadlineDaysLeft = null;
          }
        }

        return {
          title,
          publishDate,
          tenderOpenDays,
          orgName,
          subDeptName,
          bidValue,
          detailUrl,
          inquiryDeadline,
          bidDeadline,
          bidDeadlineTime,
          bidDeadlineDaysLeft,
          inquiryDeadlineDaysLeft,
          keyword: kw,
          keywordEng: kwEng,
        };
      });
    }, keyword, englishKeyword);

    if (tenders.length > 0) {
      allTenders.push(...tenders);
      allTendersForKeyword.push(...tenders);

      fs.writeFileSync(
        `tenderData/eachKeywordTender/tenders_${keyword}.json`,
        JSON.stringify(allTendersForKeyword, null, 2)
      );

      const fields = [
        "title",
        "orgName",
        "subDeptName",
        "bidValue",
        "publishDate",
        "detailUrl",
        "inquiryDeadline",
        "bidDeadline",
        "bidDeadlineTime",
        "bidDeadlineDaysLeft",
        "inquiryDeadlineDaysLeft",
        "keyword",
        "keywordEng",
        "tenderOpenDays",
      ];
      const parserWithFields = new Parser({ fields });

      fs.writeFileSync(
        `tenderData/eachKeywordTender/tenders_${keyword}.csv`,
        "\uFEFF" + parserWithFields.parse(allTendersForKeyword),
        "utf8"
      );

      console.log(`💾 Saved results after page ${currentPage} for keyword ${keyword}`);
    } else {
      console.log(`ℹ️ No tenders found on page ${currentPage} for keyword ${keyword}, skipping CSV write`);
    }

    // Pagination
    const paginationExists = await page.$(".pagination.pagination-primary");
    if (!paginationExists) {
      console.log("ℹ️ No pagination, single page only");
      break;
    }

    const nextSelector = ".pagination.pagination-primary li.active + li a.page-link";
    const nextExists = await page.$(nextSelector);
    if (!nextExists) {
      console.log("✅ Reached last page");
      break;
    }

    // ✅ Robust pagination (no page.click, no waitForNavigation)
    const firstBefore = await page
      .$eval(".col-12.col-md-12.mb-4 a", (el) => el.href)
      .catch(() => "");

    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) el.scrollIntoView({ block: "center" });
    }, nextSelector);

    try {
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) throw new Error("Next link not found");
        el.click();
      }, nextSelector);
    } catch (e) {
      console.log("⚠️ Next click failed, stopping pagination:", e.message);
      break;
    }

    try {
      await page.waitForFunction(
        (prev) => {
          const el = document.querySelector(".col-12.col-md-12.mb-4 a");
          return el && el.href !== prev;
        },
        { timeout: 60000 },
        firstBefore
      );
    } catch (e) {
      console.log("⚠️ Page did not update after clicking Next (maybe last page). Stopping.");
      break;
    }

    await sleep(800);
    currentPage++;
  }
};

export default scraperWithFilter;