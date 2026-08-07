const fs = require('fs');
const fixtures = JSON.parse(fs.readFileSync('fixtures_fallback.json'));

function findMatchingWomensUrl(mensMatch, fixturesList) {
  if (!mensMatch || !mensMatch.title) return null;
  const titleLower = mensMatch.title.toLowerCase();
  
  // Find Women's match in fixtures with the same teams
  const womensMatch = fixturesList.find(f => {
    const fTitle = f.title.toLowerCase();
    return fTitle.includes('women') && 
           mensMatch.title.split(' Vs ').every(teamPart => {
             const teamWord = teamPart.toLowerCase().replace(' men', '').replace(' women', '').trim();
             return fTitle.includes(teamWord);
           });
  });

  return womensMatch ? womensMatch.url : null;
}

const mensMatches = fixtures.filter(m => m.url.includes('men'));
console.log(`Found ${mensMatches.length} Men's matches in fixtures list. Mapping sample:`);

mensMatches.slice(0, 5).forEach(m => {
  const wUrl = findMatchingWomensUrl(m, fixtures);
  console.log(`\nMen's:   ${m.title}`);
  console.log(`Men URL:   ${m.url}`);
  console.log(`Women URL: ${wUrl}`);
});
