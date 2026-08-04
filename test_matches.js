const puppeteer = require('puppeteer');

async function scrapeLiveMatches() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-web-security']
  });
  
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    console.log('Navigating to live scores...');
    await page.goto('https://www.espncricinfo.com/live-cricket-score', { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Wait a moment for React rendering
    await new Promise(r => setTimeout(r, 2000));
    
    const matches = await page.evaluate(() => {
      const matchElements = document.querySelectorAll('div.ds-text-compact-xxs, div.ds-text-compact-xs, a[href*="live-cricket-score"]');
      const results = [];
      
      const matchLinks = document.querySelectorAll('a[href*="/live-cricket-score"]');
      matchLinks.forEach(a => {
        const url = a.href;
        const text = a.innerText.trim();
        // Traverse up to find teams/series info
        const container = a.closest('.ds-p-0') || a.closest('div[class*="ds-border-b"]');
        let title = text;
        if (container) {
          title = container.innerText.replace(/\n/g, ' ').substring(0, 100);
        }
        
        if (url && (title.toLowerCase().includes('hundred') || url.toLowerCase().includes('hundred'))) {
          results.push({ url, title });
        }
      });
      return results;
    });
    
    console.log(matches);
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

scrapeLiveMatches();
