const text = "LS-W\n(31/100 balls) 54/0";

let runs = 0;
let wickets = 0;
let balls = 0;

const scoreMatch = text.match(/(\d{1,3})\/(\d{1,2})(?!\d*\s*balls?)/);
if (scoreMatch) {
  runs = parseInt(scoreMatch[1], 10);
  wickets = parseInt(scoreMatch[2], 10);
}

// Balls matching: check for Hundred format "(31/100 balls)" first
const hundredBallsMatch = text.match(/\((\d{1,3})\/\d{1,3}\s*balls?\)/i);
if (hundredBallsMatch) {
  balls = parseInt(hundredBallsMatch[1], 10);
} else {
  const ballsMatch = text.match(/(?:(?:cb:\s*)?(\d{1,3})b)|(?:(\d{1,3})\s*balls?)/i);
  if (ballsMatch) {
    balls = parseInt(ballsMatch[1] || ballsMatch[2], 10);
  } else {
    const ovMatch = text.match(/(\d{1,2})\.(\d{1})\s*ov/i);
    if (ovMatch) {
      balls = (parseInt(ovMatch[1], 10) * 5) + parseInt(ovMatch[2], 10);
    }
  }
}

console.log({ runs, wickets, balls, scoreMatch: !!scoreMatch, ballsMatch: !!ballsMatch });
