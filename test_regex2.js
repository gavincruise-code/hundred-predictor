const text = "SRL-W\n(24/100 balls, T:137) 46/0";
let balls = 0;
const hundredBallsMatch = text.match(/\((\d{1,3})\/\d{1,3}\s*balls?/i);
if (hundredBallsMatch) {
  balls = parseInt(hundredBallsMatch[1], 10);
}
console.log({ balls, match: hundredBallsMatch });
