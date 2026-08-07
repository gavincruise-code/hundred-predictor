const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-web-security'
    ]
  });

  try {
    const page = await browser.newPage();
    
    // 1. Hide navigator.webdriver
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    });

    // 2. Set viewport & realistic user-agent
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // 3. Set extra headers
    await page.setExtraHTTPHeaders({
      'accept-language': 'en-US,en;q=0.9',
      'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'none',
      'sec-fetch-user': '?1',
      'upgrade-insecure-requests': '1'
    });

    const url = 'https://www.espncricinfo.com/series/the-hundred-women-s-competition-2026-1521193/sunrisers-leeds-women-vs-london-spirit-women-20th-match-1521216/live-cricket-score';
    console.log("Navigating to Cricinfo score page with Akamai 403 bypass...");
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    const pageTitle = await page.title();
    console.log("Page Title:", pageTitle);

    const matchHeader = await page.evaluate(() => {
      const el = document.querySelector('.ci-team-score') || document.body;
      return el.innerText;
    });

    console.log("Extracted Text Snippet:\n", matchHeader.substring(0, 200));
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await browser.close();
  }
})();
