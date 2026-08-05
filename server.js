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

async function fetchLiveMatches() {
  if (!puppeteer) throw new Error('Puppeteer is not installed');
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

    await page.goto('https://www.espncricinfo.com/live-cricket-score', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 1000));
    
    const matches = await page.evaluate(() => {
      const results = [];
      const matchLinks = document.querySelectorAll('a[href*="/live-cricket-score"]');
      matchLinks.forEach(a => {
        const url = a.href;
        if (!url || !url.includes('hundred')) return;
        
        // Try parsing the match slug for a clean title
        // Example: https://.../sunrisers-leeds-women-vs-london-spirit-women-20th-match-1521216/live-cricket-score
        try {
          const parts = url.split('/');
          const slug = parts[parts.length - 2];
          let title = slug.split('-').slice(0, -3).join(' ');
          // Title case it
          title = title.replace(/\b\w/g, l => l.toUpperCase());
          
          results.push({ title, url });
        } catch (e) {
          results.push({ title: url, url });
        }
      });
      return results;
    });
    
    // Deduplicate matches based on url
    const unique = [];
    const seen = new Set();
    matches.forEach(m => {
      if (!seen.has(m.url)) {
        seen.add(m.url);
        unique.push(m);
      }
    });
    
    return unique;
  } finally {
    await browser.close();
  }
}

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
    const pageData = await page.evaluate(() => {
      const matchHeader = document.querySelector('.ci-team-score')
                          || document.querySelector('.ds-flex.ds-flex-col.ds-mt-3.ds-space-y-1') 
                          || document.querySelector('.ds-w-full.ds-bg-fill-content-prime')
                          || document.body;
      const battingAbbr = document.querySelector('.ci-team-score')?.innerText.split('\\n')[0].trim() || '';
      return { text: matchHeader.innerText, title: document.title, battingAbbr };
    });
    
    const text = pageData.text;
    
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
    const hundredBallsMatch = text.match(/\((\d{1,3})\/\d{1,3}\s*balls?/i);
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

    // --- Intelligent Auto-Selector Logic ---
    let battingTeam = '';
    let bowlingTeam = '';
    let venue = '';

    const validTeams = [
      'Birmingham Phoenix', 'Southern Brave', 'Sunrisers Leeds', 'Manchester Super Giants', 
      'MI London', 'London Spirit', 'Trent Rockets', 'Welsh Fire'
    ];

    // Map of URL/title keywords to venue names
    const venueKeywords = [
      { keys: ['headingley', 'leeds'], venue: 'Headingley, Leeds' },
      { keys: ['edgbaston', 'birmingham'], venue: 'Edgbaston, Birmingham' },
      { keys: ['trent-bridge', 'trent bridge', 'nottingham'], venue: 'Trent Bridge, Nottingham' },
      { keys: ['oval', 'kennington'], venue: 'Kennington Oval, London' },
      { keys: ['old-trafford', 'old trafford', 'manchester'], venue: 'Old Trafford, Manchester' },
      { keys: ['sophia-gardens', 'sophia gardens', 'cardiff'], venue: 'Sophia Gardens, Cardiff' },
      { keys: ["lord's", 'lords'], venue: "Lord's, London" },
      { keys: ['rose-bowl', 'rose bowl', 'southampton'], venue: 'The Rose Bowl, Southampton' },
    ];

    // 1. Identify venue — check both the page title AND the URL
    const docTitle = (pageData.title || '').toLowerCase();
    const urlLower = url.toLowerCase();
    for (const { keys, venue: v } of venueKeywords) {
      if (keys.some(k => docTitle.includes(k) || urlLower.includes(k))) {
        venue = v;
        break;
      }
    }

    // 2. Identify the two playing teams from the URL
    // Fix: use /\s+/g not /\\s+/g (the double-escape was a bug — regex in a string literal)
    const playingTeams = [];
    for (const t of validTeams) {
      const slug = t.toLowerCase().replace(/\s+/g, '-');
      const firstWord = t.toLowerCase().split(' ')[0];
      const inUrl = urlLower.includes(slug) || urlLower.includes(firstWord);
      if (inUrl) {
        // Avoid false matches: 'london' matches both MI London and London Spirit
        if (t === 'London Spirit' && !urlLower.includes('spirit')) continue;
        if (t === 'MI London' && !urlLower.includes('mi-london')) continue;
        playingTeams.push(t);
      }
    }
    
    // Deduplicate and take first two
    const uniquePlayingTeams = [...new Set(playingTeams)].slice(0, 2);

    // 3. Match batting abbreviation using initials to figure out who is batting
    // e.g. 'LS-W' → abbr='LS' matches 'London Spirit' (L+S initials)
    if (uniquePlayingTeams.length === 2 && pageData.battingAbbr) {
      const abbr = pageData.battingAbbr.split('-')[0].toLowerCase().replace(/[^a-z]/g, '');
      
      let matchedIdx = -1;
      let bestScore = -1;

      for (let i = 0; i < 2; i++) {
        const teamName = uniquePlayingTeams[i];
        // Build initials string from team name words
        const initials = teamName.split(' ').map(w => w[0].toLowerCase()).join('');
        // Score: how many leading characters of abbr match the initials
        let score = 0;
        for (let j = 0; j < Math.min(abbr.length, initials.length); j++) {
          if (abbr[j] === initials[j]) score++;
          else break;
        }
        if (score > bestScore) {
          bestScore = score;
          matchedIdx = i;
        }
      }

      if (matchedIdx !== -1 && bestScore > 0) {
        battingTeam = uniquePlayingTeams[matchedIdx];
        bowlingTeam = uniquePlayingTeams[matchedIdx === 0 ? 1 : 0];
      } else {
        battingTeam = uniquePlayingTeams[0];
        bowlingTeam = uniquePlayingTeams[1];
      }
    } else if (uniquePlayingTeams.length === 2) {
      battingTeam = uniquePlayingTeams[0];
      bowlingTeam = uniquePlayingTeams[1];
    }

    // Detect gender from URL
    const gender = urlLower.includes('-women') ? 'womens' : 'mens';

    return { runs, wickets, balls, innings, gender, battingTeam, bowlingTeam, venue, _rawText: text.substring(0, 150) };
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

  // Handle matches list API route
  if (filePath === '/api/live-matches') {
    fetchLiveMatches().then(matches => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(matches));
    }).catch(err => {
      console.error('Failed to fetch live matches list:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to fetch match list' }));
    });
    return;
  }

  // Handle live score API route
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
