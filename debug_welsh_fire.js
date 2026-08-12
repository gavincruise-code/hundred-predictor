const puppeteer = require('puppeteer');

async function debugWelshFire() {
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
    console.log("Navigating to:", url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    const pageData = await page.evaluate(() => {
      return {
        title: document.title,
        text: document.body ? document.body.innerText : ''
      };
    });

    const text = pageData.text;
    console.log("Full title:", pageData.title);

    // Isolate match text by stripping site-wide top navigation header
    let matchText = text;
    const matchHeaderIndex = text.indexOf('Live Cricket Score');
    if (matchHeaderIndex !== -1) {
      matchText = text.substring(matchHeaderIndex);
    } else {
      const matchHeaderIndex2 = text.indexOf('The Hundred');
      if (matchHeaderIndex2 !== -1) matchText = text.substring(matchHeaderIndex2);
    }

    // 1. Team ordering by position in URL/text
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
      if (pos === -1) pos = textLower.indexOf(t.toLowerCase());
      if (pos === -1) pos = textLower.indexOf(firstWord);

      if (pos !== -1) {
        if (t === 'London Spirit' && !urlLower.includes('spirit') && !textLower.includes('spirit')) continue;
        if (t === 'MI London' && !urlLower.includes('mi-london') && !textLower.includes('mi london')) continue;
        matchedTeams.push({ team: t, pos });
      }
    }

    // Sort by position in URL/text
    matchedTeams.sort((a, b) => a.pos - b.pos);
    const uniquePlayingTeams = [...new Set(matchedTeams.map(m => m.team))].slice(0, 2);

    console.log("\nOrdered playing teams from URL:");
    console.log(uniquePlayingTeams);

    // 2. Toss parsing logic
    let battingTeam = uniquePlayingTeams[0];
    let bowlingTeam = uniquePlayingTeams[1];

    const tossMatch = matchText.match(/([A-Za-z\s]+)\s+(chose|elected)\s+to\s+(bat|field|bowl)/i);
    if (tossMatch) {
      const winnerStr = tossMatch[1].toLowerCase();
      const decision = tossMatch[3].toLowerCase();
      console.log(`\nTOSS DETECTED: Winner = "${tossMatch[1].trim()}", Decision = "${decision}"`);

      let winnerIdx = -1;
      for (let i = 0; i < uniquePlayingTeams.length; i++) {
        const tName = uniquePlayingTeams[i].toLowerCase();
        const firstWord = tName.split(' ')[0];
        if (winnerStr.includes(firstWord) || winnerStr.includes(tName)) {
          winnerIdx = i;
          break;
        }
      }

      if (winnerIdx !== -1) {
        if (decision === 'bat') {
          battingTeam = uniquePlayingTeams[winnerIdx];
          bowlingTeam = uniquePlayingTeams[winnerIdx === 0 ? 1 : 0];
        } else {
          battingTeam = uniquePlayingTeams[winnerIdx === 0 ? 1 : 0];
          bowlingTeam = uniquePlayingTeams[winnerIdx];
        }
      }
    }

    console.log("\nPARSED MATCH STATE:");
    console.log({
      battingTeam,
      bowlingTeam,
      homeTeam: uniquePlayingTeams[0],
      venue: uniquePlayingTeams[0] === 'Welsh Fire' ? 'Sophia Gardens, Cardiff' : 'Lord\'s, London'
    });
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await browser.close();
  }
}

debugWelshFire();
