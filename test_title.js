const puppeteer = require('puppeteer');

async function scrapeTitle() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-web-security']
  });
  
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0');
    await page.setRequestInterception(true);
    page.on('request', req => {
      if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) req.abort();
      else req.continue();
    });

    await page.goto('https://www.espncricinfo.com/series/the-hundred-women-s-competition-2026-1521193/sunrisers-leeds-women-vs-london-spirit-women-20th-match-1521216/live-cricket-score', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 1000));
    
    const info = await page.evaluate(() => {
      return {
        title: document.title,
        ogTitle: document.querySelector('meta[property="og:title"]')?.content,
        matchHeader: document.querySelector('.ds-text-compact-xxs')?.innerText || document.querySelector('.ds-text-tight-m')?.innerText,
        battingTeamName: document.querySelector('.ci-team-score')?.innerText
      };
    });
    
    console.log(info);
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

scrapeTitle();
