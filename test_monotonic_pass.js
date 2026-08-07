const fs = require('fs');

const mensModel = JSON.parse(fs.readFileSync('public/model_womens.json'));

function enforceMonotonicity(model) {
  const metrics = ["additional_runs_median", "additional_runs_mean", "additional_runs_p25", "additional_runs_p75"];
  
  metrics.forEach(metric => {
    const data = model[metric];
    if (!data) return;

    for (let w = 0; w <= 10; w++) {
      const wKey = String(w);
      // Backward pass: at earlier balls (more balls remaining), expected additional runs MUST be >= later balls
      for (let ball = 99; ball >= 0; ball--) {
        const bKey = String(ball);
        const bNextKey = String(ball + 1);
        
        if (data[bKey] && data[bNextKey] && data[bKey][wKey] !== undefined && data[bNextKey][wKey] !== undefined) {
          if (data[bKey][wKey] < data[bNextKey][wKey]) {
            data[bKey][wKey] = data[bNextKey][wKey];
          }
        }
      }
    }
  });
}

const dataset = mensModel['1'].overall;
enforceMonotonicity(dataset);

let prevTotal = 999;
let violations = 0;

for (let ball = 0; ball <= 100; ball++) {
  const bKey = String(ball);
  const wKey = '2';
  const median = dataset.additional_runs_median[bKey]?.[wKey];
  const mean = dataset.additional_runs_mean[bKey]?.[wKey];
  
  if (median !== undefined && mean !== undefined) {
    const additional = median * 0.6 + mean * 0.4;
    const total = 50 + additional;
    
    if (ball > 0 && total > prevTotal + 0.01) {
      console.log(`VIOLATION at ball ${ball}: previous total ${prevTotal.toFixed(1)}, new total ${total.toFixed(1)}`);
      violations++;
    }
    prevTotal = total;
  }
}

console.log(`Monotonicity violations after enforcement: ${violations}`);
