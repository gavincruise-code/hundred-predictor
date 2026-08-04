/**
 * API Adapter for Live Cricket Scores
 * 
 * This module is responsible for fetching live match data.
 */

/**
 * Fetches the current live match state by calling our backend scraper.
 * @param {string} cricinfoUrl The ESPNcricinfo match URL
 * @returns {Promise<Object>} The match state containing runs, wickets, balls, etc.
 */
async function fetchLiveMatchState(cricinfoUrl) {
  if (!cricinfoUrl) {
    throw new Error("Please provide a valid ESPNcricinfo match URL");
  }

  const response = await fetch('/api/live-match?url=' + encodeURIComponent(cricinfoUrl));
  
  if (!response.ok) {
    let errMsg = `Error ${response.status}`;
    try {
      const errData = await response.json();
      if (errData.error) errMsg = errData.error;
    } catch (e) {}
    throw new Error(errMsg);
  }

  const data = await response.json();

  return {
    runs: data.runs || 0,
    wickets: data.wickets || 0,
    balls: data.balls || 0,
    innings: data.innings || '1'
  };
}

window.LiveAPI = {
  fetchLiveMatchState
};
