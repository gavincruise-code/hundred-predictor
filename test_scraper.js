const puppeteer = require('puppeteer');

async function testScraper(url) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-web-security']
  });
  
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');
    console.log("Navigating to URL...");
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log("Loaded!");
    await new Promise(r => setTimeout(r, 1000));
    
    const text = await page.evaluate(() => document.body.innerText);
    
    const textInfo = await page.evaluate(() => {
      const header1 = document.querySelector('.ds-flex.ds-flex-col.ds-mt-3.ds-space-y-1');
      const header2 = document.querySelector('.ds-w-full.ds-bg-fill-content-prime');
      const header3 = document.querySelector('.ci-team-score');
      
      return {
        header1: header1 ? header1.innerText : null,
        header2: header2 ? header2.innerText : null,
        header3: header3 ? header3.innerText : null
      };
    });
    
    console.log("Headers:", textInfo);
    
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await browser.close();
  }
}

testScraper('https://www.espncricinfo.com/series/the-hundred-women-s-competition-2026-1521193/sunrisers-leeds-women-vs-london-spirit-women-20th-match-1521216/live-cricket-score');
