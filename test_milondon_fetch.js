const fs = require('fs');
const fixtures = JSON.parse(fs.readFileSync('fixtures_fallback.json'));

const match = fixtures.find(f => f.title.toLowerCase().includes('mi london women'));

console.log("Found match in fixtures:");
console.log(match);

if (match) {
  const http = require('http');
  const targetUrl = encodeURIComponent(match.url);
  http.get(`http://localhost:3002/api/live-match?url=${targetUrl}`, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log("\nAPI Response:");
      console.log(JSON.parse(data));
    });
  });
}
