const fs = require('fs');

// Wicket resource multipliers (Standard T20/Hundred resource table)
const WICKET_RESOURCE_TABLE = [1.00, 0.93, 0.85, 0.75, 0.63, 0.50, 0.37, 0.25, 0.15, 0.07, 0.00];

function calculateDlsBaseline(ball, wicket, baseScore = 128) {
  const ballsRemaining = Math.max(0, 100 - ball);
  const ballFraction = ballsRemaining / 100.0;
  const wktFactor = WICKET_RESOURCE_TABLE[wicket] !== undefined ? WICKET_RESOURCE_TABLE[wicket] : 0;
  
  // Power factor 0.95 accounts for death-overs acceleration
  return baseScore * Math.pow(ballFraction, 0.95) * wktFactor;
}

console.log("=== DLS Resource Decay Model Test (Base Score = 128) ===");
console.log("Ball\t0 Wkts\t1 Wkt\t2 Wkts\t3 Wkts");

for (let b = 0; b <= 30; b += 5) {
  const v0 = calculateDlsBaseline(b, 0).toFixed(1);
  const v1 = calculateDlsBaseline(b, 1).toFixed(1);
  const v2 = calculateDlsBaseline(b, 2).toFixed(1);
  const v3 = calculateDlsBaseline(b, 3).toFixed(1);
  console.log(`${b}\t${v0}\t${v1}\t${v2}\t${v3}`);
}
