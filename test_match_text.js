const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  const url = 'https://www.espncricinfo.com/series/the-hundred-men-s-competition-2026-1521192/manchester-super-giants-vs-welsh-fire-21st-match-1521217/live-cricket-score';
  
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  
  const result = await page.evaluate(() => {
    const scores = Array.from(document.querySelectorAll('.ci-team-score')).map(el => el.innerText);
    const title = document.title;
    const bodyText = document.body.innerText;
    const toss = bodyText.match(/toss[^\n]*/i)?.[0] || 'No toss info';
    const optTo = bodyText.match(/(batted|bat|fielded|field) first/i)?.[0] || '';
    
    // Check team containers / headers
    const teamNames = Array.from(document.querySelectorAll('.ds-text-title-subtext, .ds-text-title-xs')).map(e => e.innerText);
    
    return { title, scores, toss, optTo, teamNames, snippet: bodyText.substring(0, 1000) };
  });
  
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
