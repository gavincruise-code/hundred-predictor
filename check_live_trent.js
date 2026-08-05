const http = require('http');

// Find live matches from /api/live-matches
http.get('http://localhost:3002/api/live-matches', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log("Live Matches:");
    const matches = JSON.parse(data);
    console.log(matches);
    
    // Find Trent Rockets match
    const trentMatch = matches.find(m => m.name.toLowerCase().includes('trent') || m.name.toLowerCase().includes('rockets'));
    if (trentMatch) {
      console.log("\nFound Trent match:", trentMatch);
      http.get('http://localhost:3002/api/live-match?url=' + encodeURIComponent(trentMatch.url), (r) => {
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => console.log("\nMatch state:", JSON.parse(d)));
      });
    }
  });
});
