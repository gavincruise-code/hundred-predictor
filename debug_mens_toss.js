const puppeteer = require('puppeteer');

async function debugMensToss() {
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

    const url = 'https://www.espncricinfo.com/series/the-hundred-men-s-competition-2026-1521176/welsh-fire-men-vs-london-spirit-men-31st-match-1521261/live-cricket-score';
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    const pageData = await page.evaluate(() => {
      return {
        title: document.title,
        bodyText: document.body ? document.body.innerText : ''
      };
    });

    console.log("Title:", pageData.title);
    const fullText = pageData.bodyText;
    let matchText = fullText;
    const matchHeaderIndex = fullText.indexOf('Live Cricket Score');
    if (matchHeaderIndex !== -1) matchText = fullText.substring(matchHeaderIndex);

    const validTeams = [
      'Birmingham Phoenix', 'Southern Brave', 'Sunrisers Leeds', 'Manchester Super Giants', 
      'MI London', 'London Spirit', 'Trent Rockets', 'Welsh Fire'
    ];
    const urlLower = url.toLowerCase();
    const textLower = matchText.toLowerCase();

    const matchedTeams = [];
    for (const t of validTeams) {
      const slug = t.toLowerCase().replace(/\s+/g, '-');
      const firstWord = t.toLowerCase().split(' ')[0];
      
      let pos = urlLower.indexOf(slug);
      if (pos === -1) pos = urlLower.indexOf(firstWord);
      if (pos !== -1) {
        if (t === 'London Spirit' && !urlLower.includes('spirit')) continue;
        if (t === 'MI London' && !urlLower.includes('mi-london')) continue;
        matchedTeams.push({ team: t, pos });
      }
    }

    matchedTeams.sort((a, b) => a.pos - b.pos);
    const uniquePlayingTeams = [...new Set(matchedTeams.map(m => m.team))].slice(0, 2);

    let battingTeam = uniquePlayingTeams[0] || '';
    let bowlingTeam = uniquePlayingTeams[1] || '';
    let hasTossDecision = false;

    // 3. Toss parsing
    const tossMatch = matchText.match(/([A-Za-z\s]+)\s+(chose|elected)\s+to\s+(bat|field|bowl)/i);
    if (tossMatch && uniquePlayingTeams.length === 2) {
      const winnerStr = tossMatch[1].toLowerCase();
      const decision = tossMatch[3].toLowerCase();
      console.log(`\nTOSS DETECTED: Winner = "${tossMatch[1].trim()}", Decision = "${decision}"`);

      let winnerIdx = -1;
      for (let i = 0; i < 2; i++) {
        const teamName = uniquePlayingTeams[i].toLowerCase();
        const teamWords = teamName.split(' ');
        if (teamWords.some(w => w.length >= 3 && winnerStr.includes(w))) {
          winnerIdx = i;
          break;
        }
      }

      if (winnerIdx !== -1) {
        hasTossDecision = true;
        if (decision === 'bat') {
          battingTeam = uniquePlayingTeams[winnerIdx];
          bowlingTeam = uniquePlayingTeams[winnerIdx === 0 ? 1 : 0];
        } else {
          battingTeam = uniquePlayingTeams[winnerIdx === 0 ? 1 : 0];
          bowlingTeam = uniquePlayingTeams[winnerIdx];
        }
      }
    }

    console.log("After Step 3 (Toss): Batting Team = ", battingTeam);

  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await browser.close();
  }
}

debugMensToss();
