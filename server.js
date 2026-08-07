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
const cachedScores = new Map(); // url -> { score, timestamp }
const CACHE_TTL = 15000; // 15 seconds

function getPuppeteerLaunchOptions() {
  const opts = {
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu',
      '--disable-web-security'
    ]
  };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    opts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  return opts;
}

async function setupStealthPage(page) {
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  });
  await page.setViewport({ width: 1366, height: 768 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setExtraHTTPHeaders({
    'accept-language': 'en-US,en;q=0.9',
    'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'none',
    'sec-fetch-user': '?1',
    'upgrade-insecure-requests': '1'
  });
}

async function fetchLiveMatches() {
  if (!puppeteer) throw new Error('Puppeteer is not installed');
  const browser = await puppeteer.launch(getPuppeteerLaunchOptions());
  
  try {
    const page = await browser.newPage();
    await setupStealthPage(page);
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.goto('https://www.espncricinfo.com/live-cricket-match-schedule-fixtures', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 1000));
    
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
          if (title.toLowerCase().includes('tba')) return;
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
  
  const browser = await puppeteer.launch(getPuppeteerLaunchOptions());
  
  try {
    const page = await browser.newPage();
    await setupStealthPage(page);
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

    if (pageData.title.includes('Access Denied') || text.includes('permission to access')) {
      throw new Error('ESPNcricinfo blocked request (403 Access Denied)');
    }
    
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

    // Determine innings (if there's a target, requirement, innings break, or 1st innings hit 100 balls / 10 wickets)
    const isFirstInningsComplete = (balls >= 100 || wickets >= 10) && !text.match(/target/i) && !text.match(/need/i) && !text.match(/required/i);
    if (text.match(/target/i) || text.match(/need/i) || text.match(/required/i) || text.match(/req\.?\s*rate/i) || text.match(/innings break/i) || isFirstInningsComplete) {
      innings = '2';
    }

    // --- Intelligent Auto-Selector Logic ---
    const urlLower = url.toLowerCase();
    let battingTeam = '';
    let bowlingTeam = '';
    let venue = '';

    const validTeams = [
      'Birmingham Phoenix', 'Southern Brave', 'Sunrisers Leeds', 'Manchester Super Giants', 
      'MI London', 'London Spirit', 'Trent Rockets', 'Welsh Fire'
    ];

    // 1. Identify the two playing teams from the URL (Team A = Home, Team B = Away)
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

    // 2. Identify venue — check actual ground names in title/text first, else map to Home Team's ground
    const teamHomeVenues = {
      'Birmingham Phoenix': 'Edgbaston, Birmingham',
      'Sunrisers Leeds': 'Headingley, Leeds',
      'Trent Rockets': 'Trent Bridge, Nottingham',
      'MI London': 'Kennington Oval, London',
      'London Spirit': "Lord's, London",
      'Manchester Super Giants': 'Old Trafford, Manchester',
      'Welsh Fire': 'Sophia Gardens, Cardiff',
      'Southern Brave': 'The Rose Bowl, Southampton'
    };

    const docTitle = (pageData.title || '').toLowerCase();
    
    // Direct ground name matches
    if (docTitle.includes('edgbaston')) venue = 'Edgbaston, Birmingham';
    else if (docTitle.includes('headingley')) venue = 'Headingley, Leeds';
    else if (docTitle.includes('trent bridge')) venue = 'Trent Bridge, Nottingham';
    else if (docTitle.includes('oval') || docTitle.includes('kennington')) venue = 'Kennington Oval, London';
    else if (docTitle.includes('old trafford')) venue = 'Old Trafford, Manchester';
    else if (docTitle.includes('sophia gardens') || docTitle.includes('cardiff')) venue = 'Sophia Gardens, Cardiff';
    else if (docTitle.includes("lord's") || docTitle.includes('lords')) venue = "Lord's, London";
    else if (docTitle.includes('rose bowl') || docTitle.includes('southampton')) venue = 'The Rose Bowl, Southampton';
    else if (uniquePlayingTeams.length > 0 && teamHomeVenues[uniquePlayingTeams[0]]) {
      // In Team A vs Team B, Team A is the Home Team
      venue = teamHomeVenues[uniquePlayingTeams[0]];
    }

    // 3. Match batting team using word matches, nicknames, and initials
    if (uniquePlayingTeams.length === 2 && pageData.battingAbbr) {
      const cleanAbbr = pageData.battingAbbr.split('\n')[0].split('-')[0].toLowerCase().trim();
      const alphaAbbr = cleanAbbr.replace(/[^a-z]/g, '');

      let matchedIdx = -1;
      let bestScore = 0;

      for (let i = 0; i < 2; i++) {
        const teamName = uniquePlayingTeams[i];
        const teamLower = teamName.toLowerCase();
        const teamWords = teamLower.split(' ');
        const initials = teamWords.map(w => w[0]).join('');

        let score = 0;

        // 1. Direct word or substring match (e.g., "Fire", "Super Giants", "Phoenix")
        if (cleanAbbr.length >= 3 && (teamLower.includes(cleanAbbr) || teamWords.some(w => w === cleanAbbr))) {
          score = 100;
        }
        // 2. Exact initials match (e.g., "WF", "MSG", "BP", "LS")
        else if (alphaAbbr.length > 0 && alphaAbbr === initials) {
          score = 80;
        }
        // 3. Prefix initials match
        else if (alphaAbbr.length > 0 && initials.startsWith(alphaAbbr)) {
          score = 50;
        }

        if (score > bestScore) {
          bestScore = score;
          matchedIdx = i;
        }
      }

      if (matchedIdx !== -1 && bestScore > 0) {
        // If 1st innings is complete but Cricinfo is still showing 1st innings batting team,
        // swap the teams for 2nd innings chase
        if (isFirstInningsComplete) {
          battingTeam = uniquePlayingTeams[matchedIdx === 0 ? 1 : 0];
          bowlingTeam = uniquePlayingTeams[matchedIdx];
          runs = 0;
          wickets = 0;
          balls = 0;
        } else {
          battingTeam = uniquePlayingTeams[matchedIdx];
          bowlingTeam = uniquePlayingTeams[matchedIdx === 0 ? 1 : 0];
        }
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

let cachedMatchesList = null;
let lastMatchesFetchTime = 0;
const MATCHES_CACHE_TTL = 300000; // 5 minutes cache

async function getLiveMatchesWithFallback() {
  const now = Date.now();
  if (cachedMatchesList && (now - lastMatchesFetchTime < MATCHES_CACHE_TTL)) {
    return cachedMatchesList;
  }

  try {
    const scraped = await fetchLiveMatches();
    if (scraped && scraped.length > 0) {
      cachedMatchesList = scraped;
      lastMatchesFetchTime = now;
      return scraped;
    }
  } catch (err) {
    console.error('Puppeteer match list scrape error, loading fallback schedule:', err.message);
  }

  try {
    const fallbackPath = path.join(__dirname, 'fixtures_fallback.json');
    if (fs.existsSync(fallbackPath)) {
      const data = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
      if (data && data.length > 0) {
        cachedMatchesList = data;
        lastMatchesFetchTime = now;
        return data;
      }
    }
  } catch (e) {
    console.error('Error reading fixtures_fallback.json:', e.message);
  }

  return [];
}

const server = http.createServer((req, res) => {
  // Parse URL, strip query string
  let filePath = req.url.split('?')[0];

  // Default to index.html
  if (filePath === '/' || filePath === '') {
    filePath = '/index.html';
  }

  // Handle matches list API route
  if (filePath === '/api/live-matches') {
    getLiveMatchesWithFallback().then(matches => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(matches));
    }).catch(err => {
      console.error('Failed to fetch live matches list:', err);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([]));
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

    // Use Cache if fresh for this specific targetUrl
    const cached = cachedScores.get(targetUrl);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(cached.score));
      return;
    }

    fetchCricinfoScore(targetUrl).then(score => {
      cachedScores.set(targetUrl, { score, timestamp: Date.now() });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(score));
    }).catch(err => {
      console.error('Puppeteer scraping error:', err.message);
      // Fallback: If we have a cached score for this URL, serve it
      if (cached) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(cached.score));
        return;
      }
      // Safe fallback response so UI never crashes or shows HTTP error status
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        runs: 0,
        wickets: 0,
        balls: 0,
        innings: '1',
        battingTeam: '',
        bowlingTeam: '',
        venue: ''
      }));
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
