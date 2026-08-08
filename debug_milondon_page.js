const puppeteer = require('puppeteer');

async function debugPage() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--disable-gpu'
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'sec-ch-ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'none',
      'sec-fetch-user': '?1',
      'upgrade-insecure-requests': '1'
    });

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    });

    const url = 'https://www.espncricinfo.com/series/the-hundred-women-s-competition-2026-1521193/mi-london-women-vs-trent-rockets-women-25th-match-1521221/live-cricket-score';
    console.log("Navigating to:", url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    const pageData = await page.evaluate(() => {
      return {
        text: (document.title || '') + '\n' + (document.body ? document.body.innerText : ''),
        title: document.title
      };
    });

    const text = pageData.text;
    console.log("Extracted combined text snippet:");
    console.log(text.substring(0, 400));

    // Test Score Parsing logic
    let runs = 0, wickets = 0, balls = 0, innings = '1';

    // 1. Score matching (e.g. 69/4 or 162/2)
    const scoreMatch = text.match(/(\d{1,3})\/(\d{1,2})/);
    if (scoreMatch) {
      runs = parseInt(scoreMatch[1], 10);
      wickets = parseInt(scoreMatch[2], 10);
    }

    // 2. Balls matching (e.g. 60 balls or 60/100 balls)
    const ballsMatch = text.match(/\((\d{1,3})(?:\/100)?\s*balls?\)/i) || text.match(/(\d{1,3})\s*balls/i);
    if (ballsMatch) {
      balls = parseInt(ballsMatch[1], 10);
    }

    console.log("\nPARSED SCORE:");
    console.log({ runs, wickets, balls, innings });
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await browser.close();
  }
}

debugPage();
