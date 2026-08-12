const puppeteer = require('puppeteer');

async function debugInnings() {
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

    const pageData = await page.evaluate(() => {
      return { text: document.body ? document.body.innerText : '' };
    });

    const fullText = pageData.text;
    let matchText = fullText;
    const matchHeaderIndex = fullText.indexOf('Live Cricket Score');
    if (matchHeaderIndex !== -1) matchText = fullText.substring(matchHeaderIndex);

    console.log("MATCH TEXT SNIPPET (first 1500 chars):\n", matchText.substring(0, 1500));

    console.log("\nPRECISE CRICKET TARGET REGEX TEST:");
    const targetRegex = /\b(?:target\s*:?\s*\d{1,3}|target\s+of\s+\d{1,3}|t:\s*\d{1,3}|need\s+\d{1,3}\s+runs?|required\s+rate|req\.?\s*rate|innings\s+break)\b/i;
    const match = matchText.match(targetRegex);
    console.log("targetRegex match:", match ? match[0] : null);

    // Print context around matching keywords
    ['target', 'need', 'required', 'req. rate', 'innings break'].forEach(kw => {
      const idx = matchText.toLowerCase().indexOf(kw);
      if (idx !== -1) {
        console.log(`\nContext around "${kw}":`);
        console.log(matchText.substring(Math.max(0, idx - 50), Math.min(matchText.length, idx + 100)));
      }
    });

  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await browser.close();
  }
}

debugInnings();
