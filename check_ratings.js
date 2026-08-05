const fs = require('fs');

const womensModel = JSON.parse(fs.readFileSync('public/model_womens.json'));

console.log("=== Women's 1st Innings Ratings ===");
console.log(JSON.stringify(womensModel['1'].team_ratings, null, 2));

console.log("\n=== Women's 2nd Innings Ratings ===");
console.log(JSON.stringify(womensModel['2'].team_ratings, null, 2));
