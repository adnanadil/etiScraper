import puppeteer from "puppeteer";
import fs from "fs";
import { Parser } from "json2csv";
import { Storage } from "@google-cloud/storage";

import keywords from "./keywords.mjs"; // your keywords object

const parser = new Parser(); // move parser definition here

const storage = new Storage();
const bucketName = process.env.GCLOUD_STORAGE_BUCKET || "etimad-tenders-data";
const bucket = storage.bucket(bucketName);
const SENT_FILE = "tenderData/tenders_sent.json";
const GCS_FILE = "tenders_sent.json"; // file in GCS to track sent tenders


async function scraperWithFilter () {
  const browser = await puppeteer.launch({ headless: true, defaultViewport: null });
  const page = await browser.newPage();

  await page.goto("https://tenders.etimad.sa/Tender/AllTendersForVisitor", { waitUntil: "networkidle2" });
  
  // Wait for JS to render if there is any process after initial load, that is if JS modifies the DOM after load
  await new Promise(resolve => setTimeout(resolve, 3000));

  /*
  // Block images, CSS, fonts for faster loading
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const type = req.resourceType();
    if (["image", "stylesheet", "font"].includes(type)) req.abort();
    else req.continue();
  });
  */

  
  //Choosing 24 items per page from the dropdown
  // 0️⃣ Navigate to the page first
//   await page.goto("https://tenders.etimad.sa/Tender/AllTendersForVisitor", { waitUntil: "networkidle2" });
  
  
  const allTenders = [];


  // 1️⃣ Wait for the dropdown
    const itemsDropdown = await page.$('#itemsPerPage'); // use the ID of the dropdown
    if (itemsDropdown) {
        console.log('Dropdown found, selecting last option...');

        await page.evaluate(() => {
            const select = document.querySelector('#itemsPerPage');
            const options = select.querySelectorAll('option');
            const lastOption = options[options.length - 1]; // get last option
            if (lastOption) {
                lastOption.selected = true; // select it
                select.dispatchEvent(new Event('change')); // trigger change event
            }
        });

        // Wait for page to reload after changing items per page
        await new Promise(resolve => setTimeout(resolve, 3000)); // human-like wait
    } else {
        console.log('❌ Items dropdown not found');
    }

    /* Old Dropdown logic - commented out
    // New logic to choose 24 items per page

    // Wait for dropdown
    await page.waitForSelector("select.form-control", { timeout: 5000 });

    console.log("Dropdown found, selecting 24 items...");

    // Select "24" option directly
    await page.select("select.form-control", "24");

    // Wait for reload
    await page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => null);

    await page.waitForTimeout(2000); // extra wait
    */

    // Put all of the scraping logic inside a new loop of filter.
    
    // Look for the search button and if it is there click it and then look for search box and fill it with the keyword.
    const searchButton = await page.$('#searchBtnColaps'); // Adjust selector as needed
    if (searchButton) {
        console.log('Search button found, clicking to reveal search box...');
        await searchButton.click();
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for search box to appear

        // Search for the search box
        const searchBox = await page.$('#txtMultipleSearch');

        // 🔹 Added: Delay helper function
        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        // Loop through keywords
        // const keywords = ["ذكي", "health", "school", "road", "مدينة ذكية", "مرور", "اصلاح"] ;
        // for (const keyword of keywords) {
        for (const [keyword, englishKeyword] of Object.entries(keywords)) {
            if (searchBox) {
                console.log(`Filling search box with keyword: ${keyword}`);
                await searchBox.click({ clickCount: 3 }); // Select all existing text
                
                await delay(500 + Math.random() * 500); // small pause before typing

                // Type slowly like a human
                for (const char of keyword) {
                    await searchBox.type(char);
                    await delay(200 + Math.random() * 300); // 200–500ms per keystroke
                }

                await delay(1000 + Math.random() * 1000); // wait 1–2s after typing

                
                // Click the search button at the bottom of the page
                const searchButtonInDiv = await page.$('#searchBtn');
                if (searchButtonInDiv) {
                    console.log('Clicking search button to apply filter...');
                    await searchButtonInDiv.click();
                    // Wait 3–5s for results 
                    await delay(3000 + Math.random() * 2000);

                    // Get the number of tenders found for this keyword
                    const tenderElements = await page.$$('.col-12.col-md-12.mb-4');
                    console.log(`✅ Found ${tenderElements.length} tenders for keyword: ${keyword}`);
                    await tenderData(keyword, page, allTenders, englishKeyword); // Call the function to scrape tenders for this keyword

                    // Wait before going to next keyword (3–6s)
                    console.log("⏳ Waiting before next keyword...");
                    await delay(3000 + Math.random() * 3000);
                }
            } else {
                console.log('❌ Search box not found');
            }
        }
        // After all keywords are processed, save the info in the final file.
        if (allTenders.length > 0) {
            const fields = ['title','orgName' , 'subDeptName', 'bidValue' , 'publishDate', 'detailUrl', 'inquiryDeadline', 'bidDeadline', 'bidDeadlineTime','bidDeadlineDaysLeft', 'inquiryDeadlineDaysLeft','keyword', 'keywordEng', 'tenderOpenDays'];
            const finalParser = new Parser({ fields });
            const allTendersMap = new Map();
            allTenders.forEach(t => {
                allTendersMap.set(t.detailUrl, t);
            });

    
            const allTendersUnique = Array.from(allTendersMap.values());
            fs.writeFileSync("tenderData/tenders_all.csv", '\uFEFF' + finalParser.parse(allTendersUnique), "utf8");
            fs.writeFileSync("tenderData/tenders_all.json", JSON.stringify(allTendersUnique, null, 2));
            console.log("✅ Scraping complete! Total tenders scraped:", allTendersUnique.length);
            
            // Helper to format date as `YYYY-MM-DD`
            const formatDateISO = (date) => {
                const y = date.getFullYear();
                const m = String(date.getMonth() + 1).padStart(2, "0");
                const d = String(date.getDate()).padStart(2, "0");
                return `${y}-${m}-${d}`;
            };
            
            // Get today's formatted date
            const today = new Date();
            const todayFormatted = formatDateISO(today);
            
            // Here we will have all the tenders which are activein the allTenders array    
            const activeTendersMap = new Map();
            allTendersUnique.forEach(t=> {
                if (t.bidDeadline) {
                    // Compare bidDeadline with today's date as strings
                    // It's safe since both are in YYYY-MM-DD format
                    if (t.bidDeadline >= todayFormatted) {
                        activeTendersMap.set(t.detailUrl, t);
                    }
                }   
            })

            const ACTIVE_TENDERS_JSON = 'tenderData/tenders_all_active.json';
            const ACTIVE_TENDERS_CSV = 'tenderData/tenders_all_active.csv';
            
            const allTendersNotExpired = Array.from(activeTendersMap.values());
            fs.writeFileSync(ACTIVE_TENDERS_CSV, '\uFEFF' + finalParser.parse(allTendersNotExpired), "utf8");
            fs.writeFileSync(ACTIVE_TENDERS_JSON, JSON.stringify(allTendersNotExpired, null, 2));
            console.log("✅ Scraping complete! Total tenders scraped:", allTendersNotExpired.length);


            //Create another JSON and CSV file with current and previous data combined
            // The logic is to read the previous file if it exists, then get those element which match current and previous date
            // --- Create recent tenders JSON and CSV (today + yesterday) ---
            // const SENT_FILE = 'tenderData/tenders_sent.json';

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

            // console.log("✅ Downloaded sent tenders file from GCS");
            // const SENT_FILE = 'tenderData/tenders_sent.json';


            // Load already sent tenders
            // let sentTenders = [];
            // if (fs.existsSync(SENT_FILE)) {
            //     sentTenders = JSON.parse(fs.readFileSync(SENT_FILE));
            // }

            let sentTenders = JSON.parse(fs.readFileSync(SENT_FILE));

            // Got today's before and getting yesterday's dates and converitng to in YYYY-MM-DD format
            const yesterday = new Date();
            yesterday.setDate(today.getDate() - 1);


            const todayStr = formatDateISO(today);
            const yesterdayStr = formatDateISO(yesterday);

            // Filter tenders for today or yesterday that haven't been sent
            const recentTendersRaw = allTenders.filter(t =>
                (t.publishDate === todayStr || t.publishDate === yesterdayStr) &&
                !sentTenders.some(sent => sent.detailUrl === t.detailUrl)
            );

            // console.log(`ℹ️ Found ${recentTendersRaw.length} tenders from today or yesterday before deduplication`);
            // console.log(`ℹ️ Found ${recentTendersRaw} tenders from today or yesterday before deduplication`);

            // Remove duplicates by detailUrl
            const recentTendersMap = new Map();
            recentTendersRaw.forEach(t => {
                recentTendersMap.set(t.detailUrl, t);
            });

            const recentTenders = Array.from(recentTendersMap.values());

            // ✅ Sort by date descending
            recentTenders.sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate));

            console.log(`ℹ️ Found ${recentTenders.length} tenders from today or yesterday (excluding already sent)`);

            // Save recent tenders if any
            
            
            if (recentTenders.length > 0) {
                const fields = ['title','orgName' , 'subDeptName', 'bidValue' , 'publishDate', 'detailUrl', 'inquiryDeadline', 'bidDeadline', 'bidDeadlineTime', 'bidDeadlineDaysLeft','inquiryDeadlineDaysLeft' ,'keyword', 'tenderOpenDays'];
                const parserRecent = new Parser({ fields });
                fs.writeFileSync('tenderData/tenders_recent.json', JSON.stringify(recentTenders, null, 2));
                fs.writeFileSync('tenderData/tenders_recent.csv', '\uFEFF' + parserRecent.parse(recentTenders), "utf8");

                // Add these tenders to sent list to avoid resending tomorrow
                recentTenders.forEach(t => sentTenders.push(t));
                // fs.writeFileSync(SENT_FILE, JSON.stringify(sentTenders, null, 2));

                // await storage.bucket(bucketName).upload(SENT_FILE, {
                //     destination: GCS_FILE,
                // });

                fs.writeFileSync(SENT_FILE, JSON.stringify(sentTenders, null, 2));

                await bucket.upload(SENT_FILE, { destination: GCS_FILE });
                console.log("✅ Uploaded updated sent tenders file back to GCS");

                console.log("💾 Saved recent tenders (today + yesterday) to JSON and CSV, updated sent tenders");
            } else {
                console.log("ℹ️ No recent tenders found for today or yesterday (or all already sent)!!");
                const fields = ['title','orgName' , 'subDeptName', 'bidValue' , 'publishDate', 'detailUrl', 'inquiryDeadline', 'bidDeadline', 'bidDeadlineTime', 'bidDeadlineDaysLeft','inquiryDeadlineDaysLeft' ,'keyword', 'tenderOpenDays'];
                const parserRecent = new Parser({ fields });
                fs.writeFileSync("tenderData/tenders_recent.json", JSON.stringify([], null, 2));
                fs.writeFileSync("tenderData/tenders_recent.csv", "\uFEFF" + parserRecent.parse([]), "utf8");
            }
            

            await browser.close();

        } else {
            console.log("ℹ️ No tenders found for any keyword, skipping CSV/JSON creation");
            await browser.close();
        }       

    }else {
         console.log('❌ Search button not found');
    }

};

const tenderData = async (keyword, page, allTenders, englishKeyword) => {
    
    //Declare starting page as 1 and set a default ending page as 1000
    let currentPage = 1;
    const maxPages = 1000; 
    const allTendersForKeyword = [];

    // For each time the function is called, we will go through all pages from 1 to maxPages for that keyword
    // and save the results in the temp files.


    while (currentPage <= maxPages) {
        console.log(`📄 Scraping Page: ${currentPage} for keyword ${keyword}`);

        /*
        // Both title and the detail link with <a> tag have the url so we are lucky
        const tenders = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('.col-12.col-md-12.mb[-]4')).map(t => ({
            title: t.querySelector('a')?.innerText.trim() || '',
            publishDate: t.querySelector('div.col-6 span')?.innerText.trim() || '',
            detailUrl: t.querySelector('a')?.href || '',
            date: t.querySelector('col-12 col-md-9 p-0 span')?.innerText.trim() || ''
            }));
        });
        */


        const tenders = await page.evaluate((kw, kwEng) => {
            return Array.from(document.querySelectorAll('.col-12.col-md-12.mb-4')).map(t => {
                const title = t.querySelector('a')?.innerText.trim() || '';
                const publishDate = t.querySelector('div.col-6 span')?.innerText.trim() || '';
                const detailUrl = t.querySelector('a')?.href || '';

                // Select the org & sub-department data from the block you shared
                const orgContainer = t.querySelector('.col-12 p.pb-2');
                let orgName = '';
                let subDeptName = '';

                if (orgContainer) {
                const text = orgContainer.innerText.trim(); // e.g. "أمانة منطقة الرياض - بلدية البديع التفاصيل"
                const parts = text.split('-');
                orgName = parts[0]?.trim() || '';
                if (parts.length > 1) {
                    // Take all parts after orgName and remove any 'التفاصيل'
                    subDeptName = parts.slice(1).join(' - ').replace('التفاصيل', '').trim();
                } else {
                    subDeptName = '';
                }
            }

                const bidValueContainer = t.querySelector('.text-center.mb-3 span');
                const rawBidValue = bidValueContainer?.innerText.trim() || '';
                let bidValue = rawBidValue.includes("مجانا") ? "Free" : rawBidValue.replace(/[^\d]/g, ""); // Cleans number if needed


                // Select all the date sections inside the tender card
                const dateDivs = t.querySelectorAll('.tender-date .col-12.col-md-3');

                let inquiryDeadline = '';
                let bidDeadline = '';
                let bidDeadlineTime = '';

                dateDivs.forEach(d => {
                    const label = d.querySelector('label')?.innerText.trim() || '';
                    const value = d.querySelector('span')?.innerText.trim() || '';

                    if (label.includes('آخر موعد لإستلام الإستفسارات')) {
                        inquiryDeadline = value;
                    } 
                    else if (label.includes('آخر موعد لتقديم العروض')) {
                        const spans = d.querySelectorAll(':scope > span > span');
                        // const spans = d.querySelectorAll('span');
                        bidDeadline = spans[0]?.innerText.trim() || '';
                        bidDeadlineTime = spans[1]?.innerText.trim() || '';
                    } 
                });

                // Here we will compare the inquiryDeadLine and bidDeadline to get the number of days left for each tender
                
                let tenderOpenDays = '';
                let bidDeadlineDaysLeft = '';
                let inquiryDeadlineDaysLeft = '';

                const today = new Date(); // current date & time

                if (bidDeadline) {
                    const bidDeadlineCombined = bidDeadlineTime
                        ? new Date(`${bidDeadline}T${bidDeadlineTime}:00`)
                        : new Date(bidDeadline);

                    // If bidDeadlineCombined is invalid, fallback
                    if (!isNaN(bidDeadlineCombined)) {
                        const diffMs = bidDeadlineCombined - today;
                        bidDeadlineDaysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

                        // Tender open days can be calculated as days between publishDate and bidDeadline
                        const publishDateObj = new Date(publishDate);
                        if (!isNaN(publishDateObj)) {
                            const openDiffMs = bidDeadlineCombined - publishDateObj;
                            tenderOpenDays = Math.ceil(openDiffMs / (1000 * 60 * 60 * 24));
                        } else {
                            tenderOpenDays = '';
                        }
                    } else {
                        bidDeadlineDaysLeft = null;
                        console.warn("⚠️ Invalid bidDeadline:", bidDeadline, bidDeadlineTime);
                    }
                }

                if (inquiryDeadline) {
                    const inquiryDeadlineCombined = new Date(inquiryDeadline);
                    if (!isNaN(inquiryDeadlineCombined)) {
                        const diffMsInquiry = inquiryDeadlineCombined - today;
                        inquiryDeadlineDaysLeft = Math.ceil(diffMsInquiry / (1000 * 60 * 60 * 24));
                    } else {
                        inquiryDeadlineDaysLeft = null;
                        console.warn("⚠️ Invalid inquiryDeadline:", inquiryDeadline);
                    }
                }


                return { title, publishDate, tenderOpenDays, orgName , subDeptName, bidValue, detailUrl, inquiryDeadline, bidDeadline, bidDeadlineTime, bidDeadlineDaysLeft, inquiryDeadlineDaysLeft ,keyword: kw, keywordEng: kwEng};
            });
        },keyword, englishKeyword);



        if (tenders.length > 0) {
            allTenders.push(...tenders);
            allTendersForKeyword.push(...tenders);

            fs.writeFileSync(`tenderData/eachKeywordTender/tenders_${keyword}.json`, JSON.stringify(allTendersForKeyword, null, 2));
            // fs.writeFileSync(`tenderData/tenders_temp.json`, JSON.stringify(allTendersForKeyword, null, 2));

            // Always define fields to avoid errors if array is empty (even though here it's not empty)
            const fields = ['title','orgName' , 'subDeptName', 'bidValue' , 'publishDate', 'detailUrl', 'inquiryDeadline', 'bidDeadline', 'bidDeadlineTime', 'bidDeadlineDaysLeft', 'inquiryDeadlineDaysLeft', 'keyword', 'keywordEng', 'tenderOpenDays'];
            const parserWithFields = new Parser({ fields });
            fs.writeFileSync(`tenderData/eachKeywordTender/tenders_${keyword}.csv`, '\uFEFF' + parserWithFields.parse(allTendersForKeyword), "utf8");
            // fs.writeFileSync(`tenderData/tenders_temp.csv`, '\uFEFF' + parserWithFields.parse(allTendersForKeyword), "utf8");

            console.log(`💾 Saved results after page ${currentPage} for keyword ${keyword}`);
        } else {
            console.log(`ℹ️ No tenders found on page ${currentPage} for keyword ${keyword}, skipping CSV write`);
        }

        // Pagination
        const paginationExists = await page.$('.pagination.pagination-primary');
        if (!paginationExists) {
            console.log("ℹ️ No pagination, single page only");
            break;
        }

        // Safe way to get next page
        let nextLink;
        try {
            nextLink = await page.$('.pagination.pagination-primary li.active + li a.page-link');
        } catch {
            console.log("⚠️ Could not find next page link, probably last page");
            break;
        }

        if (!nextLink) {
            console.log("✅ Reached last page");
            break;
        }

        // Click next page and wait for content
        await Promise.all([
            nextLink.click(),
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => null)
        ]);

        // Random delay for human-like behavior
        await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 3000 + 2000)));

        currentPage++;
    }

}


// scraperWithFilter();

export default scraperWithFilter;
