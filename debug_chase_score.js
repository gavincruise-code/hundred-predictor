const puppeteer = require('puppeteer');

async function debugChase() {
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
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    const data = await page.evaluate(() => {
      const matchHeaderBlocks = Array.from(document.querySelectorAll('.ci-team-score')).map(el => el.innerText.trim());
      // Filter to match header blocks (usually last 2 blocks in .ci-team-score list)
      const mainBlocks = matchHeaderBlocks.slice(-2);
      return {
        title: document.title,
        mainBlocks,
        bodyText: document.body ? document.body.innerText : ''
      };
    });

    console.log("Title:", data.title);
    console.log("Main Score Blocks:", data.mainBlocks);

    // 1. Try parsing from document.title first (e.g., "LS-W 44/4 (33 balls...")
    let runs = 0, wickets = 0, balls = 0, innings = '1', activeAbbr = '';

    const titleScoreMatch = data.title.match(/^([A-Za-z\-]+)\s+(\d{1,3})\/(\d{1,2})\s*\((?:(\d{1,3})\s*balls|(\d{1,2})\.(\d{1})\s*ov)/i);
    if (titleScoreMatch) {
      activeAbbr = titleScoreMatch[1];
      runs = parseInt(titleScoreMatch[2], 10);
      wickets = parseInt(titleScoreMatch[3], 10);
      if (titleScoreMatch[4]) {
        balls = parseInt(titleScoreMatch[4], 10);
      } else if (titleScoreMatch[5]) {
        balls = parseInt(titleScoreMatch[5], 10) * 5 + parseInt(titleScoreMatch[6], 10);
      }
    }

    // 2. Check if 2nd Innings is active from mainBlocks or title
    const is2ndInnings = data.mainBlocks.some(b => b.includes('T:') || b.includes('target') || b.includes('need')) || data.bodyText.includes('need ') || data.bodyText.includes('Target ');
    if (is2ndInnings) {
      innings = '2';
    }

    console.log("\nPARSED SCORE FROM LIVE PAGE:");
    console.log({
      activeAbbr,
      runs,
      wickets,
      balls,
      innings
    });

  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await browser.close();
  }
}

debugChase();
