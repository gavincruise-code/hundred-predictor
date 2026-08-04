const http = require('http');

http.get('http://localhost:3002/api/live-match?url=https://www.espncricinfo.com/series/the-hundred-women-s-competition-2026-1521193/sunrisers-leeds-women-vs-london-spirit-women-20th-match-1521216/live-cricket-score', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log(res.statusCode);
    console.log(data);
  });
}).on("error", (err) => {
  console.log("Error: " + err.message);
});
