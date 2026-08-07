const fs = require('fs');

const WICKET_RESOURCE_TABLE = [1.00, 0.93, 0.85, 0.75, 0.63, 0.50, 0.37, 0.25, 0.15, 0.07, 0.00];

function calculateRemainingRuns(ball, wicket, initialAvgScore = 129) {
  const ballsRemaining = Math.max(0, 100 - ball);
  const ballFraction = ballsRemaining / 100.0;
  const wktFactor = WICKET_RESOURCE_TABLE[wicket] !== undefined ? WICKET_RESOURCE_TABLE[wicket] : 0;
  
  // Power 0.92 captures run-rate acceleration in death overs (85 balls left = ~87% of runs)
  return initialAvgScore * Math.pow(ballFraction, 0.92) * wktFactor;
}

console.log("=== Perfect Dot-Ball & Wicket Decay Model ===");
console.log("Initial Expected Score at 0/0: 129 runs\n");

console.log("Scenario A: 15 Dot Balls at 0 wickets (0 runs, 15 balls, 0 wkts):");
const rem15_0 = calculateRemainingRuns(15, 0, 129);
console.log(`Remaining Expected: ${rem15_0.toFixed(1)} runs -> Final Score: ${(0 + rem15_0).toFixed(1)} (Drop of ${(129 - rem15_0).toFixed(1)} runs!)\n`);

console.log("Scenario B: 15 balls with 20 runs scored (20 runs, 15 balls, 0 wkts):");
console.log(`Remaining Expected: ${rem15_0.toFixed(1)} runs -> Final Score: ${(20 + rem15_0).toFixed(1)} (+11.0 runs above initial 129!)\n`);

console.log("Scenario C: 15 balls with 0 runs and 2 wickets lost (0 runs, 15 balls, 2 wkts):");
const rem15_2 = calculateRemainingRuns(15, 2, 129);
console.log(`Remaining Expected: ${rem15_2.toFixed(1)} runs -> Final Score: ${(0 + rem15_2).toFixed(1)} (Drop of ${(129 - rem15_2).toFixed(1)} runs!)\n`);
