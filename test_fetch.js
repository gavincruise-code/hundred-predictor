const http = require('http');

http.get('http://localhost:3002/api/live-match?url=https://www.espncricinfo.com/series/the-hundred-men-s-competition-2026-1521176/birmingham-phoenix-men-vs-sunrisers-leeds-men-24th-match-1521254/live-cricket-score', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log(res.statusCode);
    console.log(data);
  });
}).on("error", (err) => {
  console.log("Error: " + err.message);
});
