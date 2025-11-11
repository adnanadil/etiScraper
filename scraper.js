const puppeteer = require('puppeteer');
const fs = require('fs');
const { Parser } = require('json2csv');

(async () => {
  try {
    const WAIT_AFTER_LOAD = 3000; // wait 3s for JS rendering
    const MAX_RETRIES = 3;        // retry if page empty
    const PAGES_PER_SESSION = 1;  // 1 page per browser session to avoid throttling
    const TOTAL_PAGES = 600;     // total pages on Etimad

    let allTenders = [];
    let currentPage = 1;

    while (currentPage <= TOTAL_PAGES) {
      const endPage = Math.min(currentPage + PAGES_PER_SESSION - 1, TOTAL_PAGES);
      console.log(`\n=== Browser session: pages ${currentPage} to ${endPage} ===`);

      const browser = await puppeteer.launch({ headless: true }); // Launching Puppeteer browser without visual UI for us to see
      const page = await browser.newPage(); // Open a new page

      // Block images, CSS, fonts → saves bandwidth
      await page.setRequestInterception(true); // Enables request monitoring on the page, by intercepting network requests.
      page.on('request', (req) => { // Listens to every network request the website tries to make.
        const type = req.resourceType();
        if (['image', 'stylesheet', 'font'].includes(type)) {
          req.abort();
        } else {
          req.continue();
        }
      });

      for (let pageNumber = currentPage; pageNumber <= endPage; pageNumber++) {
        let retries = 0;

        while (retries <= MAX_RETRIES) {
          try {
            const url = `https://tenders.etimad.sa/Tender/AllTendersForVisitor?PageNumber=${pageNumber}`;
            console.log(`Scraping page ${pageNumber} (attempt ${retries + 1})...`);
            await page.goto(url, { waitUntil: 'networkidle2' }); // Wait for page to load ... Wait until there are no more than 2 active network requests for at least 500 milliseconds.


            
            // Wait for JS to render if there is any process after initial load, that is if JS modifies the DOM after load
            await new Promise(resolve => setTimeout(resolve, WAIT_AFTER_LOAD));

            
            const tenderElements = await page.$$('.col-12.col-md-12.mb-4');
            if (tenderElements.length === 0) {
              retries++;
              console.log(`No tenders found. Retry ${retries}/${MAX_RETRIES}`);
              await new Promise(resolve => setTimeout(resolve, 2000));
              continue;
            }
            
            /*
            const dropDown = await page.$('#itemsPerPage'); // use $ for a single element

            if (!dropDown) {
              retries++;
              console.log(`Items per page dropdown not found. Retry ${retries}/${MAX_RETRIES}`);
              await new Promise(resolve => setTimeout(resolve, 2000));
              continue;
            }
           
            // Click the dropdown to open it (not always necessary but safe)
            await page.click('#itemsPerPage');

            // Find and click the last option
            await page.evaluate(() => {
              const select = document.querySelector('#itemsPerPage');
              if (!select) return;

              const options = select.querySelectorAll('option');
              const lastOption = options[options.length - 1];
              if (lastOption) {
                lastOption.selected = true;                 // Select it
                select.dispatchEvent(new Event('change')); // Trigger change event
              }
            });*/

            const tenders = await page.evaluate(() => {
              return Array.from(document.querySelectorAll('.col-12.col-md-12.mb-4')).map(t => {
                const titleEl = t.querySelector('a');
                const dateEl = t.querySelector('div.col-6 span');
                return {
                  title: titleEl ? titleEl.innerText.trim() : '',
                  publishDate: dateEl ? dateEl.innerText.trim() : '',
                  detailUrl: titleEl ? titleEl.href : ''
                };
              });
            });

            allTenders.push(...tenders);
            console.log(`Page ${pageNumber} → Scraped ${tenders.length} tenders.`);
            break; // exit retry loop

          } catch (err) {
            retries++;
            console.log(`Error on page ${pageNumber}: ${err}. Retry ${retries}/${MAX_RETRIES}`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }

      await browser.close();
      console.log(`Browser session done. Total tenders so far: ${allTenders.length}`);

      // Save intermediate results after each session
      if (allTenders.length > 0) {
        fs.writeFileSync('tenders_partial.json', JSON.stringify(allTenders, null, 2));
        const parser = new Parser();
        fs.writeFileSync('tenders_partial.csv', parser.parse(allTenders));
        console.log('Intermediate files saved.');
      }

      currentPage += PAGES_PER_SESSION;
      if (currentPage <= TOTAL_PAGES) {
        console.log('Waiting 5 seconds before next session...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    // Save final results
    if (allTenders.length > 0) {
      fs.writeFileSync('tenders_all.json', JSON.stringify(allTenders, null, 2));
      const parser = new Parser();
      fs.writeFileSync('tenders_all.csv', parser.parse(allTenders));
      console.log(`\nScraping complete! Total tenders scraped: ${allTenders.length}`);
    } else {
      console.log('No tenders scraped. Files not created.');
    }

  } catch (err) {
    console.error('Fatal error:', err);
  }
})();