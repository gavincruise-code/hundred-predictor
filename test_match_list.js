const http = require('http');

http.get('http://localhost:3002/api/live-matches', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log("Matches from /api/live-matches:");
    const matches = JSON.parse(data);
    console.log(`Total matches returned: ${matches.length}`);
    matches.forEach(m => console.log(` - ${m.title}`));
  });
});
