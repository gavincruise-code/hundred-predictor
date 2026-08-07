const fs = require('fs');

const womensModel = JSON.parse(fs.readFileSync('public/model_womens.json'));
const dataset = womensModel['1'].overall;

const metrics = ["additional_runs_median", "additional_runs_mean", "additional_runs_p25", "additional_runs_p75"];

metrics.forEach(metric => {
  const data = dataset[metric];
  if (!data) return;

  // 1. Wicket Monotonicity (Forward pass): higher wickets lost MUST NOT exceed lower wickets lost
  for (let ball = 0; ball <= 100; ball++) {
    const bKey = String(ball);
    for (let w = 1; w <= 10; w++) {
      const wKey = String(w);
      const wPrevKey = String(w - 1);
      if (data[bKey][wKey] > data[bKey][wPrevKey]) {
        data[bKey][wKey] = data[bKey][wPrevKey];
      }
    }
  }

  // 2. Ball Monotonicity (Backward pass): earlier balls MUST have >= remaining runs than later balls
  for (let w = 0; w <= 10; w++) {
    const wKey = String(w);
    for (let ball = 99; ball >= 0; ball--) {
      const bKey = String(ball);
      const bNextKey = String(ball + 1);
      if (data[bKey][wKey] < data[bNextKey][wKey]) {
        data[bKey][wKey] = data[bNextKey][wKey];
      }
    }
  }
});

console.log("=== Corrected Monotonicity: Total Score at 0 Runs for Different Wickets ===");
console.log("Ball\t0 Wkts\t1 Wkt\t2 Wkts\t3 Wkts");

for (let b = 0; b <= 30; b += 5) {
  const bKey = String(b);
  const getVal = (w) => {
    const med = dataset.additional_runs_median[bKey]?.[String(w)] || 0;
    const mean = dataset.additional_runs_mean[bKey]?.[String(w)] || 0;
    return (med * 0.6 + mean * 0.4).toFixed(1);
  };
  console.log(`${b}\t${getVal(0)}\t${getVal(1)}\t${getVal(2)}\t${getVal(3)}`);
}
