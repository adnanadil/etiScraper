const puppeteer = require("puppeteer");
const fs = require("fs");
const { Parser } = require("json2csv");
const parser = new Parser(); // move parser definition here

(async () => {
  const browser = await puppeteer.launch({ headless: false, defaultViewport: null });
  const page = await browser.newPage();


  /*
  // Block images, CSS, fonts for faster loading
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const type = req.resourceType();
    if (["image", "stylesheet", "font"].includes(type)) req.abort();
    else req.continue();
  });
  */

  await page.goto("https://tenders.etimad.sa/Tender/AllTendersForVisitor", { waitUntil: "networkidle2" });
  
  // Wait for JS to render if there is any process after initial load, that is if JS modifies the DOM after load
  await new Promise(resolve => setTimeout(resolve, 3000));


  //Choosing 24 items per page from the dropdown
  // 0️⃣ Navigate to the page first
  await page.goto("https://tenders.etimad.sa/Tender/AllTendersForVisitor", { waitUntil: "networkidle2" });
  
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


  let currentPage = 1;
  const maxPages = 2600;
  const allTenders = [];

  while (currentPage <= maxPages) {
    console.log(`📄 Scraping Page: ${currentPage}`);

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



    const tenders = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.col-12.col-md-12.mb-4')).map(t => {
            const title = t.querySelector('a')?.innerText.trim() || '';
            const publishDate = t.querySelector('div.col-6 span')?.innerText.trim() || '';
            const detailUrl = t.querySelector('a')?.href || '';

            // Select all the date sections inside the tender card
            const dateDivs = t.querySelectorAll('.tender-date .col-12.col-md-3');

            let inquiryDeadline = '';
            let bidDeadline = '';
            let otherDeadline = '';

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
    return { title, publishDate, detailUrl, inquiryDeadline, bidDeadline, otherDeadline };
  });
});














    allTenders.push(...tenders);
    console.log(`➡ Scraped ${tenders.length} tenders on page ${currentPage}`);

    fs.writeFileSync("tenders_partial_2.json", JSON.stringify(allTenders, null, 2));
    fs.writeFileSync("tenders_partial_2.csv", '\uFEFF' + parser.parse(allTenders), "utf8");
    console.log(`💾 Saved results after page ${currentPage}`);

    const pagination = await page.$(".pagination.pagination-primary");
    if (!pagination) break;

    const activeLi = await pagination.$("li.active");
    if (!activeLi) break;

    const nextLiHandle = await page.evaluateHandle((active) => active.nextElementSibling, activeLi);
    const nextLink = await nextLiHandle.$("a.page-link");
    const isDisabled = await page.evaluate(el => el.querySelector('button')?.disabled, nextLiHandle);

    if (!nextLink || isDisabled) {
      console.log("✅ No more pages, scraping finished");
      break;
    }

    await nextLink.click();
    const delay = Math.floor(Math.random() * (4000 - 2000 + 1)) + 2000;
    await new Promise(resolve => setTimeout(resolve, delay));

    currentPage++;
  }

  fs.writeFileSync("tenders_all_2.json", JSON.stringify(allTenders, null, 2));
  fs.writeFileSync("tenders_all_2.csv", '\uFEFF' + parser.parse(allTenders), "utf8");

  console.log("✅ Scraping complete! Total tenders scraped:", allTenders.length);
  await browser.close();
})();