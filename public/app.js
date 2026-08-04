/**
 * The Hundred Score Predictor — Application Logic
 *
 * Loads pre-computed prediction model JSON, handles user inputs,
 * computes live predictions, renders projected scoring curve.
 */

// ============================================================
// State
// ============================================================
const state = {
  gender: 'mens',   // 'mens' | 'womens'
  innings: '1',     // '1' | '2'
  venue: 'overall',
  battingTeam: 'overall',
  bowlingTeam: 'overall',
  liveSyncEnabled: false,
  balls: 0,
  wickets: 0,
  runs: 0,
  model: null,      // Currently active gender's full data (contains overall + venues)
  modelMens: null,
  modelWomens: null,
  animatingScore: null,  // For the count-up animation
};

// ============================================================
// DOM refs
// ============================================================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const els = {};

function cacheElements() {
  els.runsSlider = $('#runs-slider');
  els.wicketsSlider = $('#wickets-slider');
  els.ballsSlider = $('#balls-slider');
  els.runsMinus = $('#runs-minus');
  els.runsPlus = $('#runs-plus');
  els.wicketsMinus = $('#wickets-minus');
  els.wicketsPlus = $('#wickets-plus');
  els.ballsMinus = $('#balls-minus');
  els.ballsPlus = $('#balls-plus');
  els.runsValue = $('#runs-value');
  els.wicketsValue = $('#wickets-value');
  els.ballsValue = $('#balls-value');
  els.venueSelect = $('#venue-select');
  els.predictedScore = $('#predicted-score');
  els.rangeText = $('#range-text');
  els.confDot = $('#confidence-dot');
  els.confText = $('#confidence-text');
  els.currentRR = $('#current-rr');
  els.requiredRR = $('#required-rr');
  els.matchRuns = $('#match-runs');
  els.matchWickets = $('#match-wickets');
  els.matchBalls = $('#match-balls');
  els.chartCanvas = $('#projection-chart');
  els.genderBtnMens = $('#gender-mens');
  els.genderBtnWomens = $('#gender-womens');
  els.genderSlider = $('#gender-slider');
  els.inningsBtn1 = $('#innings-1');
  els.inningsBtn2 = $('#innings-2');
  els.inningsSlider = $('#innings-slider');
  els.statAvg = $('#stat-avg');
  els.statMedian = $('#stat-median');
  els.statInnings = $('#stat-innings');
  els.liveSyncCheckbox = $('#live-sync-checkbox');
  els.liveIndicator = $('#live-indicator');
  els.cricinfoUrlContainer = $('#cricinfo-url-container');
  els.cricinfoUrlInput = $('#cricinfo-url');
  els.battingTeamSelect = $('#batting-team-select');
  els.bowlingTeamSelect = $('#bowling-team-select');
  els.inputGroups = document.querySelectorAll('#inputs-card .input-group');
  els.genderToggleGroups = document.querySelectorAll('.gender-toggle');
  els.statRange = $('#stat-date-range');
  els.milestone25 = $('#milestone-25');
  els.milestone50 = $('#milestone-50');
  els.milestone75 = $('#milestone-75');
  els.milestoneSecondary25 = $('#milestone-secondary-25');
  els.milestoneSecondary50 = $('#milestone-secondary-50');
  els.milestoneSecondary75 = $('#milestone-secondary-75');
  els.milestoneOverall25 = $('#milestone-overall-25');
  els.milestoneOverall50 = $('#milestone-overall-50');
  els.milestoneOverall75 = $('#milestone-overall-75');
  els.primaryPredictionLabel = $('#primary-prediction-label');
  els.secondaryPredictionContainer = $('#secondary-prediction-container');
  els.secondaryPredictedScore = $('#secondary-predicted-score');
}

// ============================================================
// Model loading
// ============================================================
async function loadModels() {
  try {
    const [mensResp, womensResp] = await Promise.all([
      fetch('model_mens.json'),
      fetch('model_womens.json')
    ]);
    state.modelMens = await mensResp.json();
    state.modelWomens = await womensResp.json();
    updateActiveModel();
  } catch (err) {
    console.error('Failed to load models:', err);
    els.predictedScore.textContent = '—';
  }
}

function updateActiveModel() {
  const genderModel = state.gender === 'mens' ? state.modelMens : state.modelWomens;
  state.model = genderModel[state.innings];
  populateVenueSelect();
  populateTeamSelects();
  updateStatsBar();
  updatePrediction();
}

function populateVenueSelect() {
  if (!state.model || !state.model.venues) return;
  
  els.venueSelect.innerHTML = '<option value="overall">All Grounds / Overall</option>';
  const venues = Object.keys(state.model.venues).sort();
  const optionsHTML = venues.map(v => `<option value="${v}">${v}</option>`).join('');
  els.venueSelect.innerHTML = '<option value="overall">All Grounds / Overall</option>' + optionsHTML;
  
  if (venues.includes(state.venue)) {
    els.venueSelect.value = state.venue;
  } else {
    state.venue = 'overall';
    els.venueSelect.value = 'overall';
  }
}

function populateTeamSelects() {
  if (!state.model || !state.model.team_ratings) return;
  const ratings = state.model.team_ratings;
  const teams = Object.keys(ratings).filter(t => t !== 'unknown').sort();
  
  const optionsHTML = '<option value="overall">Unknown / Average</option>' + 
    teams.map(t => {
      return `<option value="${t}">${t}</option>`;
    }).join('');
    
  els.battingTeamSelect.innerHTML = optionsHTML;
  els.bowlingTeamSelect.innerHTML = optionsHTML;
  
  if (teams.includes(state.battingTeam)) {
    els.battingTeamSelect.value = state.battingTeam;
  } else {
    state.battingTeam = 'overall';
    els.battingTeamSelect.value = 'overall';
  }
  
  if (teams.includes(state.bowlingTeam)) {
    els.bowlingTeamSelect.value = state.bowlingTeam;
  } else {
    state.bowlingTeam = 'overall';
    els.bowlingTeamSelect.value = 'overall';
  }
}

// ============================================================
// Prediction Engine
// ============================================================
function predict(balls, wickets, currentRuns, venue = null) {
  if (!state.model) return null;

  // Innings is complete — no more scoring possible
  if (balls >= 100 || wickets >= 10) {
    return {
      predicted: currentRuns,
      low: currentRuns,
      high: currentRuns,
      confidence: 'high',
      count: 999,
      additionalRuns: 0,
    };
  }

  const m = venue && venue !== 'overall' ? state.model.venues[venue] : state.model.overall;
  if (!m) return null;
  
  const bKey = String(Math.min(balls, 100));
  const wKey = String(Math.min(wickets, 10));

  const median = m.additional_runs_median?.[bKey]?.[wKey];
  const mean = m.additional_runs_mean?.[bKey]?.[wKey];
  const p25 = m.additional_runs_p25?.[bKey]?.[wKey];
  const p75 = m.additional_runs_p75?.[bKey]?.[wKey];
  const count = m.sample_counts?.[bKey]?.[wKey] || 0;

  if (median === null || median === undefined) {
    return null;
  }

  // Apply Team Strength Multipliers
  let batMultiplier = 1.0;
  let bowlMultiplier = 1.0;
  
  if (state.battingTeam !== 'overall' && state.model.team_ratings && state.model.team_ratings[state.battingTeam]) {
    batMultiplier = state.model.team_ratings[state.battingTeam].batting;
  }
  if (state.bowlingTeam !== 'overall' && state.model.team_ratings && state.model.team_ratings[state.bowlingTeam]) {
    bowlMultiplier = state.model.team_ratings[state.bowlingTeam].bowling;
  }

  const multiplier = batMultiplier * bowlMultiplier;

  // Blend median and mean for a more robust estimate
  const additionalRuns = (median * 0.6 + mean * 0.4) * multiplier;
  const predicted = Math.round(currentRuns + additionalRuns);
  const low = Math.round(currentRuns + ((p25 ?? additionalRuns * 0.7) * multiplier));
  const high = Math.round(currentRuns + ((p75 ?? additionalRuns * 1.3) * multiplier));

  // Confidence based on sample count and how late in the innings
  let confidence;
  const ballsFactor = balls / 100;  // Later = more confident
  if (count >= 30 || ballsFactor > 0.8) {
    confidence = 'high';
  } else if (count >= 10 || ballsFactor > 0.5) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return { predicted, low, high, confidence, count, additionalRuns: Math.round(additionalRuns) };
}

// ============================================================
// Projected curve data
// ============================================================
function getProjectedCurve(balls, wickets, currentRuns, venue = null) {
  const points = [];
  // Add current state
  points.push({ ball: balls, runs: currentRuns });

  if (!state.model) return points;
  
  const m = venue && venue !== 'overall' ? state.model.venues[venue] : state.model.overall;
  if (!m) return points;

  // Project forward from current state
  for (let b = balls + 1; b <= 100; b++) {
    const result = predict(b, wickets, currentRuns, venue);
    if (result) {
      // The predicted final is the same from any intermediate point,
      // so we need to interpolate the path.
      // Use average cumulative runs as a shape guide.
      const avgAtB = m.avg_cumulative_runs?.[String(b)];
      const avgAtCurrent = m.avg_cumulative_runs?.[String(balls)] || 0;
      const avgAt100 = m.avg_cumulative_runs?.["100"];

      if (avgAtB !== null && avgAtCurrent !== null && avgAt100 !== null && avgAt100 > avgAtCurrent) {
        // Proportion of remaining runs expected by ball b
        const proportion = (avgAtB - avgAtCurrent) / (avgAt100 - avgAtCurrent);
        const finalPrediction = predict(balls, wickets, currentRuns, venue);
        if (finalPrediction) {
          const additionalByB = finalPrediction.additionalRuns * Math.min(1, proportion);
          points.push({ ball: b, runs: Math.round(currentRuns + additionalByB) });
        }
      }
    }
  }

  return points;
}

// ============================================================
// Chart Rendering (Canvas)
// ============================================================
let chartCtx = null;

function initChart() {
  const canvas = els.chartCanvas;
  if (!canvas) return;
  chartCtx = canvas.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
}

function resizeCanvas() {
  const canvas = els.chartCanvas;
  const container = canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = container.clientWidth * dpr;
  canvas.height = container.clientHeight * dpr;
  chartCtx.scale(dpr, dpr);
  renderChart();
}

function renderChart() {
  if (!chartCtx) return;

  const canvas = els.chartCanvas;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  const ctx = chartCtx;

  ctx.clearRect(0, 0, w, h);

  const padding = { top: 20, right: 20, bottom: 35, left: 45 };
  const plotW = w - padding.left - padding.right;
  const plotH = h - padding.top - padding.bottom;

  // Determine Y axis max
  const finalPred = predict(state.balls, state.wickets, state.runs, state.venue);
  let yMax = Math.max(180, state.runs + 20);
  if (finalPred) yMax = Math.max(yMax, finalPred.high + 20);
  yMax = Math.ceil(yMax / 20) * 20;

  const xScale = (ball) => padding.left + (ball / 100) * plotW;
  const yScale = (runs) => padding.top + plotH - (runs / yMax) * plotH;

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;

  // Horizontal grid
  const yStep = yMax <= 200 ? 20 : 50;
  for (let y = 0; y <= yMax; y += yStep) {
    ctx.beginPath();
    ctx.moveTo(padding.left, yScale(y));
    ctx.lineTo(w - padding.right, yScale(y));
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '10px Inter';
    ctx.textAlign = 'right';
    ctx.fillText(y, padding.left - 8, yScale(y) + 3);
  }

  // Vertical grid
  for (let x = 0; x <= 100; x += 10) {
    ctx.beginPath();
    ctx.moveTo(xScale(x), padding.top);
    ctx.lineTo(xScale(x), h - padding.bottom);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '10px Inter';
    ctx.textAlign = 'center';
    ctx.fillText(x, xScale(x), h - padding.bottom + 15);
  }

  // Axis labels
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = '11px Inter';
  ctx.textAlign = 'center';
  ctx.fillText('Balls Bowled', w / 2, h - 2);

  ctx.save();
  ctx.translate(12, h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Runs', 0, 0);
  ctx.restore();

  // Historical average curve
  if (state.model) {
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    let started = false;
    const m = state.venue !== 'overall' ? state.model.venues[state.venue] : state.model.overall;
    for (let b = 0; b <= 100; b++) {
      const avg = m.avg_cumulative_runs?.[String(b)];
      if (avg !== null && avg !== undefined) {
        if (!started) {
          ctx.moveTo(xScale(b), yScale(avg));
          started = true;
        } else {
          ctx.lineTo(xScale(b), yScale(avg));
        }
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Projected curve from current state
  const curve = getProjectedCurve(state.balls, state.wickets, state.runs, state.venue);
  if (curve.length > 1) {
    // Confidence band (semi-transparent)
    if (finalPred) {
      const bandScale = 0.15;
      ctx.beginPath();
      // Upper band
      for (let i = 0; i < curve.length; i++) {
        const x = xScale(curve[i].ball);
        const bandWidth = (curve[i].runs - state.runs) * bandScale;
        const y = yScale(curve[i].runs + bandWidth);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      // Lower band (reverse)
      for (let i = curve.length - 1; i >= 0; i--) {
        const x = xScale(curve[i].ball);
        const bandWidth = (curve[i].runs - state.runs) * bandScale;
        const y = yScale(Math.max(0, curve[i].runs - bandWidth));
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(0, 212, 170, 0.06)';
      ctx.fill();
    }

    // Projected line
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 212, 170, 0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    for (let i = 0; i < curve.length; i++) {
      const x = xScale(curve[i].ball);
      const y = yScale(curve[i].runs);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Actual scoring path (0 to current ball)
  if (state.balls > 0) {
    ctx.beginPath();
    const gradient = ctx.createLinearGradient(xScale(0), 0, xScale(state.balls), 0);
    gradient.addColorStop(0, '#00d4aa');
    gradient.addColorStop(1, '#3b82f6');
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Simple linear path from (0,0) to (balls, runs)
    ctx.moveTo(xScale(0), yScale(0));
    ctx.lineTo(xScale(state.balls), yScale(state.runs));
    ctx.stroke();
  }

  // Current position dot
  ctx.beginPath();
  ctx.arc(xScale(state.balls), yScale(state.runs), 6, 0, Math.PI * 2);
  ctx.fillStyle = '#00d4aa';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(xScale(state.balls), yScale(state.runs), 10, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0, 212, 170, 0.3)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Predicted final dot
  if (finalPred && state.balls < 100) {
    ctx.beginPath();
    ctx.arc(xScale(100), yScale(finalPred.predicted), 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 212, 170, 0.6)';
    ctx.fill();

    // Label
    ctx.fillStyle = 'rgba(0, 212, 170, 0.8)';
    ctx.font = 'bold 12px Outfit';
    ctx.textAlign = 'right';
    ctx.fillText(finalPred.predicted, xScale(100) - 10, yScale(finalPred.predicted) + 4);
  }

  // Current score label
  ctx.fillStyle = '#f1f5f9';
  ctx.font = 'bold 11px Outfit';
  ctx.textAlign = 'left';
  const labelX = xScale(state.balls) + 12;
  const labelY = yScale(state.runs);
  ctx.fillText(`${state.runs}/${state.wickets}`, labelX, labelY + 4);

  // Legend
  const legendY = padding.top + 5;
  const legendX = w - padding.right - 10;

  ctx.textAlign = 'right';
  ctx.font = '10px Inter';

  // Actual
  ctx.strokeStyle = '#00d4aa';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(legendX - 70, legendY);
  ctx.lineTo(legendX - 50, legendY);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillText('Actual', legendX - 75, legendY + 3);

  // Projected
  ctx.strokeStyle = 'rgba(0,212,170,0.5)';
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(legendX - 70, legendY + 16);
  ctx.lineTo(legendX - 50, legendY + 16);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillText('Projected', legendX - 75, legendY + 19);

  // Average
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(legendX - 70, legendY + 32);
  ctx.lineTo(legendX - 50, legendY + 32);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillText('Average', legendX - 75, legendY + 35);
}

// ============================================================
// Update UI
// ============================================================
function updatePrediction() {
  const result = predict(state.balls, state.wickets, state.runs, state.venue);
  const overallResult = state.venue !== 'overall' ? predict(state.balls, state.wickets, state.runs, 'overall') : null;

  // Match state display
  if (els.matchRuns) els.matchRuns.textContent = state.runs;
  if (els.matchWickets) els.matchWickets.textContent = state.wickets;
  if (els.matchBalls) els.matchBalls.textContent = state.balls;

  // Run rate
  const currentRR = state.balls > 0 ? (state.runs / state.balls * 5).toFixed(2) : '0.00';
  if (els.currentRR) els.currentRR.textContent = currentRR;

  if (result) {
    animateScore(result.predicted);
    els.rangeText.innerHTML = `likely range: <span class="prediction__range-values">${result.low} – ${result.high}</span>`;

    // Confidence
    els.confDot.className = `confidence__dot confidence__dot--${result.confidence}`;
    const confLabels = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' };
    els.confText.textContent = `${confLabels[result.confidence]} · ${result.count} historical innings`;

    // Required RR to reach predicted
    const ballsLeft = 100 - state.balls;
    if (ballsLeft > 0 && result.additionalRuns > 0) {
      const reqRR = (result.additionalRuns / ballsLeft * 5).toFixed(2);
      if (els.requiredRR) els.requiredRR.textContent = reqRR;
    } else {
      if (els.requiredRR) els.requiredRR.textContent = '—';
    }

    // Secondary (Overall) Prediction Display
    if (overallResult && state.venue !== 'overall') {
      els.primaryPredictionLabel.textContent = `Expected Final Score (${state.venue})`;
      els.secondaryPredictionContainer.style.display = 'inline-flex';
      els.secondaryPredictedScore.textContent = overallResult.predicted;
    } else {
      els.primaryPredictionLabel.textContent = 'Predicted Final Score';
      els.secondaryPredictionContainer.style.display = 'none';
    }

    // Milestones
    const curve = getProjectedCurve(state.balls, state.wickets, state.runs, state.venue);
    const overallCurve = state.venue !== 'overall' ? getProjectedCurve(state.balls, state.wickets, state.runs, 'overall') : null;
    
    [25, 50, 75].forEach(mBalls => {
      const el = els[`milestone${mBalls}`];
      const secCont = els[`milestoneSecondary${mBalls}`];
      const secVal = els[`milestoneOverall${mBalls}`];
      if (!el) return;
      if (state.balls >= mBalls) {
        el.textContent = '—';
        if (secCont) secCont.style.display = 'none';
      } else {
        const point = curve.find(p => p.ball === mBalls);
        el.textContent = point ? point.runs : '—';
        
        if (overallCurve && state.venue !== 'overall') {
          const overallPoint = overallCurve.find(p => p.ball === mBalls);
          if (secCont && secVal) {
            secCont.style.display = 'block';
            secVal.textContent = overallPoint ? overallPoint.runs : '—';
          }
        } else {
          if (secCont) secCont.style.display = 'none';
        }
      }
    });

  } else {
    els.predictedScore.textContent = '—';
    els.rangeText.textContent = 'insufficient data';
    els.confDot.className = 'confidence__dot confidence__dot--low';
    els.confText.textContent = 'No data for this state';
    els.secondaryPredictionContainer.style.display = 'none';
    [25, 50, 75].forEach(mBalls => {
      if (els[`milestone${mBalls}`]) els[`milestone${mBalls}`].textContent = '—';
      if (els[`milestoneSecondary${mBalls}`]) els[`milestoneSecondary${mBalls}`].style.display = 'none';
    });
  }

  renderChart();
}

function animateScore(target) {
  if (state.animatingScore !== null) {
    cancelAnimationFrame(state.animatingScore);
  }

  const current = parseInt(els.predictedScore.textContent) || 0;
  if (current === target) return;

  const diff = target - current;
  const duration = 300;
  const startTime = performance.now();

  function step(timestamp) {
    const elapsed = timestamp - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = Math.round(current + diff * eased);
    els.predictedScore.textContent = value;

    if (progress < 1) {
      state.animatingScore = requestAnimationFrame(step);
    } else {
      els.predictedScore.textContent = target;
      state.animatingScore = null;
      // Pop animation
      els.predictedScore.classList.remove('score-pop');
      void els.predictedScore.offsetWidth; // force reflow
      els.predictedScore.classList.add('score-pop');
    }
  }

  state.animatingScore = requestAnimationFrame(step);
}

function updateSliderFill(slider) {
  const min = parseFloat(slider.min) || 0;
  const max = parseFloat(slider.max) || 100;
  const val = parseFloat(slider.value) || 0;
  const pct = ((val - min) / (max - min)) * 100;
  slider.style.setProperty('--fill', pct + '%');
}

// Stats bar
// ============================================================
function updateStatsBar() {
  if (!state.model) return;
  const m = state.venue && state.venue !== 'overall' ? state.model.venues[state.venue] : state.model.overall;
  if (!m) return;
  
  els.statAvg.textContent = m.summary.avg_score.toFixed(1);
  els.statMedian.textContent = m.summary.median_score.toFixed(1);
  els.statInnings.textContent = m.meta.innings_count;
  els.statRange.textContent = state.model.overall.meta.date_range; // Use overall dates
}

// ============================================================
// Event Handlers
// ============================================================
function setupListeners() {
  // Form logic (Venue, Teams, Sliders)
  els.venueSelect.addEventListener('change', (e) => {
    state.venue = e.target.value;
    updateStatsBar();
    updatePrediction();
  });

  els.battingTeamSelect.addEventListener('change', (e) => {
    state.battingTeam = e.target.value;
    updatePrediction();
  });

  els.bowlingTeamSelect.addEventListener('change', (e) => {
    state.bowlingTeam = e.target.value;
    updatePrediction();
  });

  // Stepper helper
  const setupStepper = (minusBtn, plusBtn, sliderElement, stateKey) => {
    const update = (delta) => {
      let val = parseInt(sliderElement.value) + delta;
      const min = parseInt(sliderElement.min) || 0;
      const max = parseInt(sliderElement.max) || 100;
      val = Math.max(min, Math.min(max, val));
      
      sliderElement.value = val;
      state[stateKey] = val;
      els[`${stateKey}Value`].textContent = val;
      updateSliderFill(sliderElement);
      updatePrediction();
    };
    
    minusBtn.addEventListener('click', () => update(-1));
    plusBtn.addEventListener('click', () => update(1));
  };

  setupStepper(els.runsMinus, els.runsPlus, els.runsSlider, 'runs');
  setupStepper(els.wicketsMinus, els.wicketsPlus, els.wicketsSlider, 'wickets');
  setupStepper(els.ballsMinus, els.ballsPlus, els.ballsSlider, 'balls');

  // Sliders
  els.runsSlider.addEventListener('input', (e) => {
    state.runs = parseInt(e.target.value);
    els.runsValue.textContent = state.runs;
    updateSliderFill(e.target);
    updatePrediction();
  });

  els.wicketsSlider.addEventListener('input', (e) => {
    state.wickets = parseInt(e.target.value);
    els.wicketsValue.textContent = state.wickets;
    updateSliderFill(e.target);
    updatePrediction();
  });

  els.ballsSlider.addEventListener('input', (e) => {
    state.balls = parseInt(e.target.value);
    els.ballsValue.textContent = state.balls;
    updateSliderFill(e.target);
    updatePrediction();
  });

  // Gender toggle
  els.genderBtnMens.addEventListener('click', () => {
    state.gender = 'mens';
    els.genderBtnMens.classList.add('active');
    els.genderBtnWomens.classList.remove('active');
    els.genderSlider.classList.remove('right');
    updateActiveModel();
  });

  els.genderBtnWomens.addEventListener('click', () => {
    state.gender = 'womens';
    els.genderBtnWomens.classList.add('active');
    els.genderBtnMens.classList.remove('active');
    els.genderSlider.classList.add('right');
    updateActiveModel();
  });

  // Innings toggle
  els.inningsBtn1.addEventListener('click', () => {
    state.innings = '1';
    els.inningsBtn1.classList.add('active');
    els.inningsBtn2.classList.remove('active');
    els.inningsSlider.classList.remove('right');
    updateActiveModel();
  });

  els.inningsBtn2.addEventListener('click', () => {
    state.innings = '2';
    els.inningsBtn2.classList.add('active');
    els.inningsBtn1.classList.remove('active');
    els.inningsSlider.classList.add('right');
    updateActiveModel();
  });

  // Live Sync logic
  let liveSyncInterval = null;

  async function fetchAndApplyLiveSync() {
    if (!state.liveSyncEnabled || !window.LiveAPI) return;
    
    const url = els.cricinfoUrlInput.value.trim();
    if (!url) {
      els.predictedScore.textContent = 'Paste URL...';
      return;
    }

    try {
      els.liveIndicator.style.animation = 'pulse 0.5s infinite'; // Fast pulse while fetching
      const liveData = await window.LiveAPI.fetchLiveMatchState(url);
      els.liveIndicator.style.animation = 'pulse 1.5s infinite'; // Normal pulse
      
      if (liveData.innings) {
        state.innings = liveData.innings;
      }
      
      if (state.gender === 'mens') {
        els.genderBtnMens.classList.add('active');
        els.genderBtnWomens.classList.remove('active');
        els.genderSlider.classList.remove('right');
      } else {
        els.genderBtnWomens.classList.add('active');
        els.genderBtnMens.classList.remove('active');
        els.genderSlider.classList.add('right');
      }

      if (state.innings === '1') {
        els.inningsBtn1.classList.add('active');
        els.inningsBtn2.classList.remove('active');
        els.inningsSlider.classList.remove('right');
      } else {
        els.inningsBtn2.classList.add('active');
        els.inningsBtn1.classList.remove('active');
        els.inningsSlider.classList.add('right');
      }
      
      if (state.model) {
        populateVenueSelect();
        populateTeamSelects();
        els.venueSelect.value = state.venue;
        els.battingTeamSelect.value = state.battingTeam;
        els.bowlingTeamSelect.value = state.bowlingTeam;
        
        state.runs = liveData.runs;
        state.wickets = liveData.wickets;
        state.balls = liveData.balls;
        
        els.runsSlider.value = state.runs;
        els.wicketsSlider.value = state.wickets;
        els.ballsSlider.value = state.balls;
        els.runsValue.textContent = state.runs;
        els.wicketsValue.textContent = state.wickets;
        els.ballsValue.textContent = state.balls;
        
        [els.runsSlider, els.wicketsSlider, els.ballsSlider].forEach(updateSliderFill);
        updateStatsBar();
        updatePrediction();
      }
    } catch (err) {
      console.error('Live Sync Error:', err);
      els.predictedScore.textContent = 'Error';
      els.liveIndicator.style.animation = 'pulse 1.5s infinite';
    }
  }

  function toggleLiveSync(enabled) {
    state.liveSyncEnabled = enabled;
    
    els.inputGroups.forEach(el => el.classList.toggle('disabled-ui', enabled));
    els.genderToggleGroups.forEach(el => el.classList.toggle('disabled-ui', enabled));
    
    if (enabled) {
      els.liveIndicator.style.display = 'block';
      els.cricinfoUrlContainer.style.display = 'block';
      fetchAndApplyLiveSync();
      liveSyncInterval = setInterval(fetchAndApplyLiveSync, 15000);
    } else {
      els.liveIndicator.style.display = 'none';
      els.cricinfoUrlContainer.style.display = 'none';
      if (liveSyncInterval) clearInterval(liveSyncInterval);
      updatePrediction(); // Restore prediction text
    }
  }

  els.liveSyncCheckbox.addEventListener('change', (e) => {
    toggleLiveSync(e.target.checked);
  });

  els.cricinfoUrlInput.addEventListener('change', () => {
    if (state.liveSyncEnabled) fetchAndApplyLiveSync();
  });

  // Initialize slider fills
  [els.runsSlider, els.wicketsSlider, els.ballsSlider].forEach(updateSliderFill);
}

// ============================================================
// Init
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  cacheElements();
  initChart();
  setupListeners();
  loadModels();
});
