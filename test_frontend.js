const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  // Go to local server
  await page.goto('http://localhost:3002');
  
  // Wait for models to load
  await new Promise(r => setTimeout(r, 1000));
  
  // Scramble dropdowns
  await page.evaluate(() => {
    document.getElementById('venue-select').value = 'overall';
    document.getElementById('batting-team-select').value = 'Southern Brave';
    document.getElementById('bowling-team-select').value = 'Trent Rockets';
  });
  
  console.log("Before sync:");
  console.log(await page.evaluate(() => ({
    venue: document.getElementById('venue-select').value,
    bat: document.getElementById('batting-team-select').value,
    bowl: document.getElementById('bowling-team-select').value
  })));
  
  // Wait for live matches list to populate
  await new Promise(r => setTimeout(r, 2000));
  
  // Select the first live match (index 1 because 0 is "Select a live match")
  await page.evaluate(() => {
    const sel = document.getElementById('live-match-select');
    sel.selectedIndex = 1;
    sel.dispatchEvent(new Event('change'));
  });
  
  // Turn on Live Sync
  await page.evaluate(() => {
    const toggle = document.getElementById('live-sync-toggle');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
  });
  
  // Wait for fetchAndApplyLiveSync to complete (the API fetch takes a couple seconds)
  await new Promise(r => setTimeout(r, 6000));
  
  console.log("After sync:");
  console.log(await page.evaluate(() => ({
    venue: document.getElementById('venue-select').value,
    bat: document.getElementById('batting-team-select').value,
    bowl: document.getElementById('bowling-team-select').value
  })));
  
  await browser.close();
})();
