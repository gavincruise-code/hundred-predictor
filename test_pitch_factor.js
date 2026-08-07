const fs = require('fs');

const womensModel = JSON.parse(fs.readFileSync('public/model_womens.json'));

function calculatePitchFactor(venueName, womensActualScore) {
  // Find ground baseline in women's 1st innings model
  const venueData = womensModel['1']?.venues?.[venueName];
  const baseline = venueData?.summary?.avg_score || womensModel['1']?.overall?.summary?.avg_score || 127.5;

  if (!womensActualScore || womensActualScore <= 0) {
    return { factor: 1.0, baseline, actual: null };
  }

  // Calculate ratio
  let ratio = womensActualScore / baseline;
  // Clamp between 0.80 (-20%) and 1.20 (+20%)
  ratio = Math.max(0.80, Math.min(1.20, ratio));

  return {
    factor: Math.round(ratio * 1000) / 1000,
    baseline,
    actual: womensActualScore,
    percentChange: Math.round((ratio - 1.0) * 1000) / 10
  };
}

console.log("=== Testing Same-Day Pitch Factor Calculation ===");
console.log("Edgbaston (Baseline 124.0), Women scored 148:");
console.log(calculatePitchFactor("Edgbaston, Birmingham", 148));

console.log("\nLord's (Baseline 125.0), Women scored 95:");
console.log(calculatePitchFactor("Lord's, London", 95));

console.log("\nHeadingley (Baseline 127.5), No Women score yet:");
console.log(calculatePitchFactor("Headingley, Leeds", null));
