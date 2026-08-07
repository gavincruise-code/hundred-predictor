const fs = require('fs');

const womensModel = JSON.parse(fs.readFileSync('public/model_womens.json'));
const data = womensModel['1'].overall;

console.log("=== Women's 1st Innings: Total Score at 0 Runs for Different Wickets ===");
console.log("Ball\t0 Wkts\t1 Wkt\t2 Wkts\t3 Wkts");

for (let b = 0; b <= 30; b += 5) {
  const bKey = String(b);
  const getVal = (w) => {
    const med = data.additional_runs_median[bKey]?.[String(w)] || 0;
    const mean = data.additional_runs_mean[bKey]?.[String(w)] || 0;
    return (med * 0.6 + mean * 0.4).toFixed(1);
  };
  console.log(`${b}\t${getVal(0)}\t${getVal(1)}\t${getVal(2)}\t${getVal(3)}`);
}
