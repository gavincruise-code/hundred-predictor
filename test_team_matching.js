function matchBattingTeam(rawAbbr, uniquePlayingTeams) {
  if (!rawAbbr || uniquePlayingTeams.length !== 2) return -1;
  
  const cleanAbbr = rawAbbr.split('\n')[0].split('-')[0].toLowerCase().trim();
  const alphaAbbr = cleanAbbr.replace(/[^a-z]/g, '');

  let bestIdx = -1;
  let bestScore = 0;

  for (let i = 0; i < 2; i++) {
    const teamName = uniquePlayingTeams[i];
    const teamLower = teamName.toLowerCase();
    const teamWords = teamLower.split(' ');
    const initials = teamWords.map(w => w[0]).join('');

    let score = 0;

    // 1. Direct word or substring match (e.g., "Fire", "Super Giants", "Phoenix")
    if (cleanAbbr.length >= 3 && (teamLower.includes(cleanAbbr) || teamWords.some(w => w === cleanAbbr))) {
      score = 100;
    }
    // 2. Initials match (e.g., "WF", "MSG", "BP", "LS")
    else if (alphaAbbr === initials) {
      score = 80;
    }
    // 3. Partial initials match
    else if (alphaAbbr.length > 0 && initials.startsWith(alphaAbbr)) {
      score = 50;
    }

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  return bestIdx;
}

const teams = ["Manchester Super Giants", "Welsh Fire"];
console.log("Input 'Fire':", teams[matchBattingTeam("Fire\n\n#2", teams)]);
console.log("Input 'WF':", teams[matchBattingTeam("WF-W", teams)]);
console.log("Input 'Super Giants':", teams[matchBattingTeam("Super Giants", teams)]);
console.log("Input 'MSG':", teams[matchBattingTeam("MSG", teams)]);
