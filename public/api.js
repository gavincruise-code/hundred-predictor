/**
 * API Adapter for Live Cricket Scores
 * 
 * This module is responsible for fetching live match data.
 * Currently uses a mock implementation to simulate a live match.
 */

let mockBalls = 0;
let mockRuns = 0;
let mockWickets = 0;

/**
 * Fetches the current live match state.
 * @returns {Promise<Object>} The match state containing runs, wickets, balls, etc.
 */
async function fetchLiveMatchState() {
  // TODO: Replace with actual API call (e.g. fetch('https://api.provider.com/match/xyz'))
  
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 500));

  // Mock logic: progress the match state slightly each time it's called
  if (mockBalls < 100 && mockWickets < 10) {
    mockBalls += Math.floor(Math.random() * 3) + 1; // Advance 1-3 balls
    mockRuns += Math.floor(Math.random() * 8);      // Score 0-7 runs
    
    // 5% chance of a wicket per ball chunk
    if (Math.random() < 0.05) {
      mockWickets += 1;
    }
  }

  // Cap values
  mockBalls = Math.min(mockBalls, 100);
  mockWickets = Math.min(mockWickets, 10);
  mockRuns = Math.min(mockRuns, 250);

  return {
    runs: mockRuns,
    wickets: mockWickets,
    balls: mockBalls,
    gender: 'mens',     // mock match gender
    innings: '1',       // mock innings
    venue: 'Lord\'s'    // mock venue
  };
}

// Attach to window so it can be used globally without modules
window.LiveAPI = {
  fetchLiveMatchState,
  // Helper to reset the mock match
  resetMock() {
    mockBalls = 0;
    mockRuns = 0;
    mockWickets = 0;
  }
};
