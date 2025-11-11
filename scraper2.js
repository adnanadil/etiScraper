const puppeteer = require('puppeteer');
const fs = require('fs');
const { Parser } = require('json2csv');

(async () => {
  try {
    const WAIT_AFTER_LOAD = 3000; // Wait after page load for JS rendering
    const MAX_RETRIES = 3;        // Max retry per page
    const PAGES_PER_SESSION = 1;  // Restart browser after every X pages (to prevent memory leak / throttling)
    const TOTAL_PAGES = 600;     // Can update or make this dynamic later

    // ✅ Base URL with all important filters already applied
    const BASE_URL = `https://tenders.etimad.sa/Tender/AllTendersForVisitor?&MultipleSearch=&TenderCategory=&ReferenceNumber=&TenderNumber=&agency=&ConditionaBookletRange=&PublishDateId=5&LastOfferPresentationDate=&TenderAreasIdString=&TenderTypeId=&TenderActivityId=&TenderSubActivityId=&AgencyCode=&FromLastOfferPresentationDateString=&ToLastOfferPresentationDateString=&SortDirection=DESC&Sort=SubmitionDate&PageSize=24&IsSearch=true&PageNumber=`;

    let allTenders = [];
    let currentPage = 1;

    while (currentPage <= TOTAL_PAGES) {
      const endPage = Math.min(currentPage + PAGES_PER_SESSION - 1, TOTAL_PAGES);
      console.log(`\n=== Browser session: pages ${currentPage} to ${endPage} ===`);

      const browser = await puppeteer.launch({ headless: true });
      const page = await browser.newPage();

      // ✅ Block unnecessary resources for faster loading
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const resource = req.resourceType();
        if (['image', 'stylesheet', 'font'].includes(resource)) req.abort();
        else req.continue();
      });

      // This for loop goes through each page in the current browser session
      for (let pageNumber = currentPage; pageNumber <= endPage; pageNumber++) {
        let retries = 0;
        
        // This while loop retries loading the page if it fails or has no tenders
        while (retries <= MAX_RETRIES) {
          try {
            const url = `${BASE_URL}${pageNumber}`;
            console.log(`Scraping page ${pageNumber} (attempt ${retries + 1})...`);

            // ✅ Go to page, and wait until network is idle for 500 miliseconds
            await page.goto(url, { waitUntil: 'networkidle2' });

            // ✅ Wait for JS rendering for dynamic content
            await new Promise(resolve => setTimeout(resolve, WAIT_AFTER_LOAD));

            // ✅ Check tenders exist
            const tenderElements = await page.$$('.col-12.col-md-12.mb-4');
            if (tenderElements.length === 0) {
              retries++;
              console.log(`⚠ No tenders found. Retry ${retries}/${MAX_RETRIES}`);
              // Pause code for 2 seconds before retrying so that go to page does it's job in the background and try again
              await new Promise(resolve => setTimeout(resolve, 2000));
              continue;
            }

            // ✅ Scrape tenders
            const tenders = await page.evaluate(() => {
              return Array.from(document.querySelectorAll('.col-12.col-md-12.mb-4')).map(t => ({
                title: t.querySelector('a')?.innerText.trim() || '',
                publishDate: t.querySelector('div.col-6 span')?.innerText.trim() || '',
                detailUrl: t.querySelector('a')?.href || ''
              }));
            });

            allTenders.push(...tenders);
            console.log(`✅ Page ${pageNumber} → Scraped ${tenders.length} tenders.`);
            break;

          } catch (error) {
            retries++;
            console.log(`❌ Error on page ${pageNumber}: ${error} (Retry ${retries}/${MAX_RETRIES})`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }

      await browser.close();
      console.log(`💾 Browser session done. Total tenders so far: ${allTenders.length}`);

      // ✅ Save after each session
      if (allTenders.length > 0) {
        fs.writeFileSync('tenders_partial.json', JSON.stringify(allTenders, null, 2));
        const parser = new Parser();
        fs.writeFileSync('tenders_partial.csv', '\uFEFF' + parser.parse(allTenders), "utf8");
        console.log('📁 Intermediate files saved.');
      }

      currentPage += PAGES_PER_SESSION;
      if (currentPage <= TOTAL_PAGES) {
        console.log('⏳ Waiting 5 seconds before next session...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    // ✅ Final save
    fs.writeFileSync('tenders_all.json', JSON.stringify(allTenders, null, 2));
    const parser = new Parser();
    fs.writeFileSync('tenders_all.csv', '\uFEFF' + parser.parse(allTenders), "utf8");
    console.log(`🎉 Scraping complete! Total tenders scraped: ${allTenders.length}`);
  } catch (err) {
    console.error('💥 Fatal error:', err);
  }
})();