const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
  
  console.log("Navigating to fixtures schedule...");
  await page.goto('https://www.espncricinfo.com/live-cricket-match-schedule-fixtures', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  
  const matches = await page.evaluate(() => {
    const results = [];
    const matchLinks = document.querySelectorAll('a[href*="/live-cricket-score"]');
    matchLinks.forEach(a => {
      const url = a.href;
      if (!url || !url.includes('hundred')) return;
      try {
        const parts = url.split('/');
        const slug = parts[parts.length - 2];
        let title = slug.split('-').slice(0, -3).join(' ');
        title = title.replace(/\b\w/g, l => l.toUpperCase());
        results.push({ title, url });
      } catch (e) {
        results.push({ title: url, url });
      }
    });
    return results;
  });

  const unique = [];
  const seen = new Set();
  matches.forEach(m => {
    if (!seen.has(m.url)) {
      seen.add(m.url);
      unique.push(m);
    }
  });

  console.log(`Found ${unique.length} Hundred matches on schedule page:`);
  console.log(unique);
  
  await browser.close();
})();
