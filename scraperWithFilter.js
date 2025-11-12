const puppeteer = require("puppeteer");
const fs = require("fs");
const { Parser } = require("json2csv");
const parser = new Parser(); // move parser definition here

const keywords = require("./keywords"); // ✅ require the array


(async () => {
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
  await page.goto("https://tenders.etimad.sa/Tender/AllTendersForVisitor", { waitUntil: "networkidle2" });
  
  
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
                lastOption.selected = false; // select it
                select.dispatchEvent(new Event('change')); // trigger change event
            }
        });

        // Wait for page to reload after changing items per page
        await new Promise(resolve => setTimeout(resolve, 3000)); // human-like wait
    } else {
        console.log('❌ Items dropdown not found');
    }

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
        for (const keyword of keywords) {
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
                    await tenderData(keyword, page, allTenders); // Call the function to scrape tenders for this keyword

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
            const fields = ['title', 'publishDate', 'detailUrl', 'inquiryDeadline', 'bidDeadline', 'keyword'];
            const finalParser = new Parser({ fields });
            const allTendersMap = new Map();
            allTenders.forEach(t => {
                allTendersMap.set(t.detailUrl, t);
            });

            const allTendersUnique = Array.from(allTendersMap.values());
            fs.writeFileSync("tenderData/tenders_all.csv", '\uFEFF' + finalParser.parse(allTendersUnique), "utf8");
            fs.writeFileSync("tenderData/tenders_all.json", JSON.stringify(allTendersUnique, null, 2));
            console.log("✅ Scraping complete! Total tenders scraped:", allTendersUnique.length);

            //Create another JSON and CSV file with current and previous data combined
            // The logic is to read the previous file if it exists, then get those element which match current and previous date
            // --- Create recent tenders JSON and CSV (today + yesterday) ---
            const SENT_FILE = 'tenderData/tenders_sent.json';

            // Load already sent tenders
            let sentTenders = [];
            if (fs.existsSync(SENT_FILE)) {
                sentTenders = JSON.parse(fs.readFileSync(SENT_FILE));
            }

            // Get today's and yesterday's dates in YYYY-MM-DD format
            const today = new Date();
            const yesterday = new Date();
            yesterday.setDate(today.getDate() - 1);

            const formatDateISO = (date) => {
                const y = date.getFullYear();
                const m = String(date.getMonth() + 1).padStart(2, "0");
                const d = String(date.getDate()).padStart(2, "0");
                return `${y}-${m}-${d}`;
            };

            const todayStr = formatDateISO(today);
            const yesterdayStr = formatDateISO(yesterday);

            // Filter tenders for today or yesterday that haven't been sent
            const recentTendersRaw = allTenders.filter(t =>
                (t.publishDate === todayStr || t.publishDate === yesterdayStr) &&
                !sentTenders.some(sent => sent.detailUrl === t.detailUrl)
            );

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
                const fields = ['title', 'publishDate', 'detailUrl', 'inquiryDeadline', 'bidDeadline', 'keyword'];
                const parserRecent = new Parser({ fields });

                fs.writeFileSync('tenderData/tenders_recent.json', JSON.stringify(recentTenders, null, 2));
                fs.writeFileSync('tenderData/tenders_recent.csv', '\uFEFF' + parserRecent.parse(recentTenders), "utf8");

                // Add these tenders to sent list to avoid resending tomorrow
                recentTenders.forEach(t => sentTenders.push(t));
                fs.writeFileSync(SENT_FILE, JSON.stringify(sentTenders, null, 2));

                console.log("💾 Saved recent tenders (today + yesterday) to JSON and CSV, updated sent tenders");
            } else {
                console.log("ℹ️ No recent tenders found for today or yesterday (or all already sent)");
            }
            

            await browser.close();

        } else {
            console.log("ℹ️ No tenders found for any keyword, skipping CSV/JSON creation");
            await browser.close();
        }       

    }else {
         console.log('❌ Search button not found');
    }

})();

const tenderData = async (keyword, page, allTenders) => {
    
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
            return Array.from(document.querySelectorAll('.col-12.col-md-12.mb-4')).map(t => ({
            title: t.querySelector('a')?.innerText.trim() || '',
            publishDate: t.querySelector('div.col-6 span')?.innerText.trim() || '',
            detailUrl: t.querySelector('a')?.href || '',
            date: t.querySelector('col-12 col-md-9 p-0 span')?.innerText.trim() || ''
            }));
        });
        */


        const tenders = await page.evaluate((kw) => {
            return Array.from(document.querySelectorAll('.col-12.col-md-12.mb-4')).map(t => {
                const title = t.querySelector('a')?.innerText.trim() || '';
                const publishDate = t.querySelector('div.col-6 span')?.innerText.trim() || '';
                const detailUrl = t.querySelector('a')?.href || '';

                // Select all the date sections inside the tender card
                const dateDivs = t.querySelectorAll('.tender-date .col-12.col-md-3');

                let inquiryDeadline = '';
                let bidDeadline = '';

                dateDivs.forEach(d => {
                    const label = d.querySelector('label')?.innerText.trim() || '';
                    const value = d.querySelector('span')?.innerText.trim() || '';

                    if (label.includes('آخر موعد لإستلام الإستفسارات')) {
                        inquiryDeadline = value;
                    } 
                    else if (label.includes('آخر موعد لتقديم العروض')) {
                        bidDeadline = value;
                    } 
                });
                return { title, publishDate, detailUrl, inquiryDeadline, bidDeadline, keyword: kw };
            });
        },keyword);



        if (tenders.length > 0) {
            allTenders.push(...tenders);
            allTendersForKeyword.push(...tenders);

            fs.writeFileSync(`tenderData/eachKeywordTender/tenders_${keyword}.json`, JSON.stringify(allTendersForKeyword, null, 2));
            // fs.writeFileSync(`tenderData/tenders_temp.json`, JSON.stringify(allTendersForKeyword, null, 2));

            // Always define fields to avoid errors if array is empty (even though here it's not empty)
            const fields = ['title', 'publishDate', 'detailUrl', 'inquiryDeadline', 'bidDeadline', 'keyword'];
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