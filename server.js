const http = require('http');
const fs = require('fs');
const path = require('path');
let puppeteer = null;
try {
  puppeteer = require('puppeteer');
} catch (e) {
  console.warn('Puppeteer not installed yet');
}

const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// --- Puppeteer Scraper ---
let cachedScore = null;
let lastFetchTime = 0;
const CACHE_TTL = 15000; // 15 seconds

async function fetchCricinfoScore(url) {
  if (!puppeteer) throw new Error('Puppeteer is not installed');
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-web-security']
  });
  
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Give it a second to load React data
    await new Promise(r => setTimeout(r, 1000));
    
    // Extract text from the page
    const text = await page.evaluate(() => {
      const matchHeader = document.querySelector('.ci-team-score')
                          || document.querySelector('.ds-flex.ds-flex-col.ds-mt-3.ds-space-y-1') 
                          || document.querySelector('.ds-w-full.ds-bg-fill-content-prime')
                          || document.body;
      return matchHeader.innerText;
    });
    
    let runs = 0;
    let wickets = 0;
    let balls = 0;
    let innings = '1';
    
    // Basic heuristics to parse the text. Negative lookahead prevents "31/100 balls" from being parsed as score.
    const scoreMatch = text.match(/(\d{1,3})\/(\d{1,2})(?!\d*\s*balls?)/);
    if (scoreMatch) {
      runs = parseInt(scoreMatch[1], 10);
      wickets = parseInt(scoreMatch[2], 10);
    } else {
      const allOutMatch = text.match(/(\d{1,3})\s*all\s*out/i);
      if (allOutMatch) {
        runs = parseInt(allOutMatch[1], 10);
        wickets = 10;
      }
    }
    
    // Balls matching
    const hundredBallsMatch = text.match(/\((\d{1,3})\/\d{1,3}\s*balls?\)/i);
    if (hundredBallsMatch) {
      balls = parseInt(hundredBallsMatch[1], 10);
    } else {
      const ballsMatch = text.match(/(?:(?:cb:\s*)?(\d{1,3})b)|(?:(\d{1,3})\s*balls?)/i);
      if (ballsMatch) {
        balls = parseInt(ballsMatch[1] || ballsMatch[2], 10);
      } else {
        const ovMatch = text.match(/(\d{1,2})\.(\d{1})\s*ov/i);
        if (ovMatch) {
          // Assume 5 ball overs for The Hundred
          balls = (parseInt(ovMatch[1], 10) * 5) + parseInt(ovMatch[2], 10);
        }
      }
    }

    // Determine innings (very naive: if there's a target, it's 2nd innings)
    if (text.match(/target/i) || text.match(/need/i)) {
      innings = '2';
    }

    return { runs, wickets, balls, innings, _rawText: text.substring(0, 150) };
  } finally {
    await browser.close();
  }
}
// -------------------------

const server = http.createServer((req, res) => {
  // Parse URL, strip query string
  let filePath = req.url.split('?')[0];

  // Default to index.html
  if (filePath === '/' || filePath === '') {
    filePath = '/index.html';
  }

  // Handle API route
  if (filePath === '/api/live-match') {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const targetUrl = parsedUrl.searchParams.get('url');
    
    if (!targetUrl) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing url parameter' }));
      return;
    }

    // Use Cache
    if (cachedScore && (Date.now() - lastFetchTime < CACHE_TTL)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(cachedScore));
      return;
    }

    fetchCricinfoScore(targetUrl).then(score => {
      cachedScore = score;
      lastFetchTime = Date.now();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(score));
    }).catch(err => {
      console.error('Puppeteer scraping error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to scrape live score from the provided URL' }));
    });
    return;
  }

  // Resolve to public directory
  const fullPath = path.join(__dirname, 'public', filePath);

  // Security: prevent directory traversal
  if (!fullPath.startsWith(path.join(__dirname, 'public'))) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(fullPath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // SPA fallback: serve index.html for unknown routes
        fs.readFile(path.join(__dirname, 'public', 'index.html'), (err2, data2) => {
          if (err2) {
            res.writeHead(500);
            res.end('Server Error');
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(data2);
        });
      } else {
        res.writeHead(500);
        res.end('Server Error');
      }
      return;
    }

    // Disable caching for development
    const cacheControl = 'no-cache, no-store, must-revalidate';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': cacheControl,
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`The Hundred Score Predictor running on port ${PORT}`);
});
