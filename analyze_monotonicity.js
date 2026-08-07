const fs = require('fs');

const mensModel = JSON.parse(fs.readFileSync('public/model_mens.json'));

console.log("=== Checking Monotonicity of Expected Total Score (Fixed Runs=50, Wickets=2) ===");
const data = mensModel['1'].overall;

let prevTotal = 999;
let violations = 0;

for (let ball = 0; ball <= 100; ball++) {
  const bKey = String(ball);
  const wKey = '2';
  const median = data.additional_runs_median[bKey]?.[wKey];
  const mean = data.additional_runs_mean[bKey]?.[wKey];
  
  if (median !== undefined && mean !== undefined) {
    const additional = median * 0.6 + mean * 0.4;
    const total = 50 + additional;
    
    if (ball > 0 && total > prevTotal + 0.1) {
      console.log(`VIOLATION at ball ${ball}: previous total ${prevTotal.toFixed(1)}, new total ${total.toFixed(1)} (+${(total - prevTotal).toFixed(1)} runs!)`);
      violations++;
    }
    prevTotal = total;
  }
}

console.log(`Total monotonicity violations found for 2 wickets: ${violations}`);
