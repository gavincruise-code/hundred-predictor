const fs = require('fs');
const path = require('path');

function getMergedMatches(scrapedMatches = []) {
  const fallbackPath = path.join(__dirname, 'fixtures_fallback.json');
  let fallbackMatches = [];
  if (fs.existsSync(fallbackPath)) {
    fallbackMatches = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
  }

  const combined = [...scrapedMatches, ...fallbackMatches];
  const unique = [];
  const seen = new Set();

  combined.forEach(m => {
    if (m && m.url && !seen.has(m.url)) {
      seen.add(m.url);
      unique.push(m);
    }
  });

  return unique;
}

const result = getMergedMatches([
  { title: "Scraped Match 1", url: "https://www.espncricinfo.com/series/1" }
]);

console.log(`Total merged matches: ${result.length}`);
console.log("Includes Welsh Fire Women?:", result.some(m => m.title.toLowerCase().includes('welsh fire women')));
