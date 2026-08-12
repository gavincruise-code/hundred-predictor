const puppeteer = require('puppeteer');

async function debugWelshFire() {
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

    const url = 'https://www.espncricinfo.com/series/the-hundred-women-s-competition-2026-1521193/welsh-fire-women-vs-london-spirit-women-31st-match-1521227/live-cricket-score';
    console.log("Navigating to:", url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    const pageData = await page.evaluate(() => {
      return {
        title: document.title,
        text: document.body ? document.body.innerText : ''
      };
    });

    const text = pageData.text;
    console.log("Full title:", pageData.title);

    // Isolate match text by stripping site-wide top navigation header
    let matchText = text;
    const matchHeaderIndex = text.indexOf('Live Cricket Score');
    if (matchHeaderIndex !== -1) {
      matchText = text.substring(matchHeaderIndex);
    } else {
      const matchHeaderIndex2 = text.indexOf('The Hundred');
      if (matchHeaderIndex2 !== -1) matchText = text.substring(matchHeaderIndex2);
    }

    console.log("\nIsolated Match Text (first 500 chars):");
    console.log(matchText.substring(0, 500));

    // Check if match is upcoming / unstarted
    const isUpcoming = matchText.includes('Upcoming') || 
                       matchText.match(/Today,\s*\d{1,2}:\d{2}/i) || 
                       matchText.match(/Match starts at/i) || 
                       !pageData.title.match(/^\w{2,5}-\w?\s*\d{1,3}\/\d{1,2}/); // Title doesn't start with "WF-W 69/4"

    console.log("\nIs Upcoming / Unstarted Match?:", isUpcoming);

    let runs = 0, wickets = 0, balls = 0, innings = '1';

    if (!isUpcoming) {
      // 1. Score matching (e.g. 69/4 or 162/2)
      const scoreMatch = matchText.match(/(\d{1,3})\/(\d{1,2})(?!\d*\s*balls?)/);
      if (scoreMatch) {
        runs = parseInt(scoreMatch[1], 10);
        wickets = parseInt(scoreMatch[2], 10);
      }

      // 2. Balls matching (e.g. 60 balls or 60/100 balls)
      const ballsMatch = matchText.match(/\((\d{1,3})(?:\/100)?\s*balls?\)/i) || matchText.match(/(\d{1,3})\s*balls/i);
      if (ballsMatch) {
        balls = parseInt(ballsMatch[1], 10);
      }
    }

    console.log("\nFINAL PARSED RESULT FOR APP:");
    console.log({ runs, wickets, balls, innings, isUpcoming });
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await browser.close();
  }
}

debugWelshFire();
