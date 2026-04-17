// KikaCentroid — game logic + PWA glue.
// Module script: deferred, strict mode.

// ── Constants ────────────────────────────────────────────────────────────
const GRID           = 17;
const CELL_MIN       = 16;      // minimum cell size in CSS px (small-phone safe)
const BOARD_MAX      = 380;     // max board edge in CSS px
const MAX_ROUNDS     = 10;
const PENALTY_AT     = 3;       // seconds before per-second penalty kicks in
const ROUND_POTENTIAL = 10;     // points available per round (= number of pdots)
const DPR            = Math.min(window.devicePixelRatio || 1, 2);

const COLORS = {
  bg:       '#0d1117',
  grid:     '#21262d',
  hover:    'rgba(0,212,255,0.13)',
  dot:      '#4d8fcc',
  guess:    '#f0a040',
  guessHit: '#ff6b6b',
  optimal:  '#66bb6a',
  vector:   'rgba(102,187,106,0.6)',
  dim:      'rgba(0,0,0,0.38)',
};

// ── State ────────────────────────────────────────────────────────────────
function mkState() {
  return {
    phase:      'idle',  // idle | countdown | playing | downtime | recap
    round:      0,
    dots:       [],
    optimal:    null,
    guess:      null,
    showResult: false,
    timer:      0,
    penalty:    0,
    totalScore: 0,
    history:    [],
    hover:      null,
  };
}

let S = mkState();
let timerInterval = null;
const timeouts = [];
let cellPx = 20;            // current CSS px per cell, recomputed on resize
let boardPx = GRID * cellPx;

// Hard Mode persistence — unlock once the user breaks 91 total points.
let hardUnlocked = localStorage.getItem('kc-hard-unlocked') === '1';
let hardMode     = hardUnlocked && localStorage.getItem('kc-hard-mode-on') === '1';
const UNLOCK_AT  = 91;

const schedule = (fn, ms) => {
  const id = setTimeout(fn, ms);
  timeouts.push(id);
  return id;
};
const clearScheduled = () => {
  for (const id of timeouts) clearTimeout(id);
  timeouts.length = 0;
};
const stopTimer = () => {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
};

// ── Math ─────────────────────────────────────────────────────────────────
const centroid = (dots) => {
  const n = dots.length;
  if (!n) return { x: 0, y: 0 };
  let sx = 0, sy = 0;
  for (const d of dots) { sx += d.x; sy += d.y; }
  return { x: sx / n, y: sy / n };
};
const chebyshev = (a, b) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

// Standard mode progression: EASY → MEDIUM → HARD.
// Hard Mode is unlocked at total ≥ 91 — every tier gets 5× the dot count
// of its standard-mode counterpart, and the tier labels escalate too.
const diffFor = (round) => {
  if (hardMode) {
    if (round <= 3) return { name: 'HARD',    min: 15, max: 40, color: '#ff4444' };
    if (round <= 7) return { name: 'EXTREME', min: 25, max: 50, color: '#ff1a1a' };
    return                 { name: 'INSANE',  min: 35, max: 60, color: '#ff0088' };
  }
  if (round <= 3) return { name: 'EASY',   min: 3, max: 8,  color: '#00ff88' };
  if (round <= 7) return { name: 'MEDIUM', min: 5, max: 10, color: '#ffaa00' };
  return                 { name: 'HARD',   min: 7, max: 12, color: '#ff4444' };
};

// ── DOM refs ─────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const dom = {
  canvas:        $('grid-canvas'),
  sample:        $('sample-canvas'),
  canvasWrap:    $('canvas-wrapper'),
  pregrid:       $('pregrid'),
  potentialDots: $('potential-dots'),
  halo:          $('halo'),
  scoreRow:      $('score-row'),
  idleScreen:    $('idle-screen'),
  subtitle:      $('subtitle'),
  hudDiff:       $('hud-diff'),
  hudTimerWrap:  $('hud-timer-wrap'),
  hudTimer:      $('hud-timer'),
  hudPenalty:    $('hud-penalty'),
  total:         $('disp-total'),
  ptsFlash:      $('pts-flash'),
  countdown:     $('countdown-overlay'),
  countdownText: $('countdown-text'),
  actionBtn:     $('action-btn'),
  btnLabel:      $('btn-label'),
  hint:          $('hint-text'),
  recapModal:    $('recap-modal'),
  recapMsg:      $('recap-msg'),
  recapTotal:    $('recap-total'),
  recapPerfect:  $('recap-perfect'),
  recapAvg:      $('recap-avg'),
  recapTime:     $('recap-time'),
  recapRounds:   $('recap-rounds'),
  recapHist:     $('recap-hist'),
  btnPlayAgain:  $('btn-play-again'),
  btnShare:      $('btn-share'),
  btnLink:       $('btn-link'),
  btnInstall:    $('btn-install'),
  iosHint:       $('ios-install-hint'),
  iosHintClose:  $('ios-hint-close'),
  toast:         $('update-toast'),
  btnRefresh:    $('btn-refresh'),
  btnToastClose: $('btn-toast-close'),
  hardToggle:    $('hard-toggle'),
  unlockBanner:  $('unlock-banner'),
};

const ctx = dom.canvas.getContext('2d');

// ── Canvas sizing ────────────────────────────────────────────────────────
// The board is whatever square fits inside .canvas-wrap (which is a flex:1
// region). Take the smaller of width/height/BOARD_MAX, snap to an integer
// cell, and resize the backing store to match DPR.
function sizeBoard() {
  const wrap = dom.canvasWrap;
  if (wrap.hidden) return;                       // idle screen — no board to size
  const w = wrap.clientWidth;
  const h = wrap.clientHeight;
  if (!w || !h) return;
  const target = Math.min(w, h, BOARD_MAX);
  const newCell = Math.max(CELL_MIN, Math.floor(target / GRID));
  const newBoard = newCell * GRID;
  if (newCell === cellPx && dom.canvas.width === newBoard * DPR) return;
  cellPx  = newCell;
  boardPx = newBoard;

  dom.canvas.width        = boardPx * DPR;
  dom.canvas.height       = boardPx * DPR;
  dom.canvas.style.width  = boardPx + 'px';
  dom.canvas.style.height = boardPx + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  draw();
}

const ro = new ResizeObserver(() => sizeBoard());
ro.observe(document.body);
ro.observe(dom.canvasWrap);

// orientationchange fires before layout settles on iOS; rAF after it.
window.addEventListener('orientationchange', () => {
  requestAnimationFrame(() => requestAnimationFrame(sizeBoard));
});

// Block context menu on the canvas (long-press selection on touch).
dom.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ── Draw ─────────────────────────────────────────────────────────────────
function draw() {
  ctx.clearRect(0, 0, boardPx, boardPx);

  // Background
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, boardPx, boardPx);

  // Grid
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= GRID; i++) {
    const p = i * cellPx;
    ctx.beginPath(); ctx.moveTo(p, 0);       ctx.lineTo(p, boardPx); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p);       ctx.lineTo(boardPx, p); ctx.stroke();
  }

  // Hover (pointer:fine only — we suppress on coarse devices)
  if (S.phase === 'playing' && !S.showResult && S.hover) {
    ctx.fillStyle = COLORS.hover;
    ctx.fillRect(S.hover.x * cellPx + 1, S.hover.y * cellPx + 1, cellPx - 2, cellPx - 2);
  }

  // Dots
  ctx.fillStyle = COLORS.dot;
  for (const d of S.dots) {
    ctx.fillRect(d.x * cellPx + 2, d.y * cellPx + 2, cellPx - 4, cellPx - 4);
  }

  // Guess
  if (S.guess) {
    ctx.fillStyle = S.showResult ? COLORS.guessHit : COLORS.guess;
    ctx.fillRect(S.guess.x * cellPx + 2, S.guess.y * cellPx + 2, cellPx - 4, cellPx - 4);
  }

  // Result vectors + optimal
  if (S.showResult && S.optimal) {
    const opt = S.optimal;
    ctx.strokeStyle = COLORS.vector;
    ctx.lineWidth = 1.5;
    for (const d of S.dots) {
      ctx.beginPath();
      ctx.moveTo(d.x * cellPx + cellPx / 2, d.y * cellPx + cellPx / 2);
      ctx.lineTo(opt.x * cellPx + cellPx / 2, opt.y * cellPx + cellPx / 2);
      ctx.stroke();
    }
    ctx.fillStyle = COLORS.optimal;
    ctx.fillRect(opt.x * cellPx + 2, opt.y * cellPx + 2, cellPx - 4, cellPx - 4);
  }

  // Downtime dim
  if (S.phase === 'downtime') {
    ctx.fillStyle = COLORS.dim;
    ctx.fillRect(0, 0, boardPx, boardPx);
  }
}

// ── Pointer interaction ──────────────────────────────────────────────────
const isCoarse = matchMedia('(pointer: coarse)').matches;

function cellAt(e) {
  const r  = dom.canvas.getBoundingClientRect();
  const gx = Math.floor((e.clientX - r.left) / cellPx);
  const gy = Math.floor((e.clientY - r.top)  / cellPx);
  if (gx < 0 || gx >= GRID || gy < 0 || gy >= GRID) return null;
  return { x: gx, y: gy };
}

dom.canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;     // skip hover for touch/pen
  if (S.phase !== 'playing' || S.showResult) return;
  const cell = cellAt(e);
  if (cell && (!S.hover || cell.x !== S.hover.x || cell.y !== S.hover.y)) {
    S.hover = cell;
    draw();
  }
});
dom.canvas.addEventListener('pointerleave', () => {
  if (!S.hover) return;
  S.hover = null;
  draw();
});
dom.canvas.addEventListener('pointerdown', (e) => {
  if (S.phase !== 'playing' || S.showResult) return;
  const cell = cellAt(e);
  if (!cell) return;
  e.preventDefault();
  if (S.guess && S.guess.x === cell.x && S.guess.y === cell.y) {
    validate();
  } else {
    S.guess = cell;
    updateUI(); draw();
  }
});

// ── Game logic ───────────────────────────────────────────────────────────
function startRound(nr) {
  const diff = diffFor(nr);
  const n    = diff.min + Math.floor(Math.random() * (diff.max - diff.min + 1));
  const used = new Set();
  const dots = [];
  while (dots.length < n) {
    const x = Math.floor(Math.random() * GRID);
    const y = Math.floor(Math.random() * GRID);
    const k = `${x},${y}`;
    if (used.has(k)) continue;
    used.add(k);
    dots.push({ x, y });
  }
  const c = centroid(dots);

  S.phase      = 'playing';
  S.round      = nr;
  S.dots       = dots;
  S.optimal    = { x: Math.round(c.x), y: Math.round(c.y) };
  S.guess      = null;
  S.showResult = false;
  S.timer      = 0;
  S.penalty    = 0;
  S.hover      = null;

  stopTimer();
  timerInterval = setInterval(() => {
    if (S.phase !== 'playing' || S.showResult) return;
    if (document.hidden) return;             // pause when tab/app backgrounded
    S.timer++;
    if (S.timer > PENALTY_AT) S.penalty++;
    updateUI();
  }, 1000);

  renderPotentialDots();                     // reset the 10 dots for this round
  startHalo();                               // 3s shrinking ring
  updateUI(); draw();
}

function validate() {
  if (!S.guess || !S.optimal || S.showResult) return;
  stopTimer();
  hideHalo();                               // round committed — kill the ring

  const dist         = chebyshev(S.guess, S.optimal);
  const deductions   = dist + S.penalty;                // total points lost this round
  const roundPoints  = ROUND_POTENTIAL - deductions;    // can go negative
  const perfectAim   = dist === 0;                      // landed on the centroid
  const spotless     = deductions === 0;                // full 10/10, no time penalty either

  S.showResult  = true;
  S.phase       = 'downtime';
  S.totalScore += roundPoints;
  S.history.push({
    round: S.round,
    roundPoints,
    dist,
    penalty: S.penalty,
    timer: S.timer,
    perfect: perfectAim,
  });

  // Flash: "−X" (points lost) or "✨ +10 ✨" for a spotless round.
  dom.ptsFlash.classList.toggle('gain', spotless);
  dom.ptsFlash.textContent = spotless ? '✨ +10 ✨' : `−${deductions}`;
  dom.ptsFlash.hidden = false;

  renderPotentialDots();                                // flash the distance dots red
  updateUI(); draw();

  schedule(() => {
    dom.ptsFlash.hidden = true;
    const next = S.round + 1;
    if (next <= MAX_ROUNDS) {
      schedule(() => startRound(next), 180);
    } else {
      showRecap();
    }
  }, 1000);
}

// ── Potential-points tracker ─────────────────────────────────────────────
// 10 dots drain right-to-left: first by time penalty (grey → faded),
// then at validate by distance (red flash → gone).
function renderPotentialDots() {
  const nodes = dom.potentialDots.children;
  const dist  = S.showResult && S.guess && S.optimal
    ? chebyshev(S.guess, S.optimal)
    : 0;
  const lostTime = Math.min(ROUND_POTENTIAL, S.penalty);
  const lostDist = Math.min(ROUND_POTENTIAL - lostTime, dist);

  for (let i = 0; i < ROUND_POTENTIAL; i++) {
    const node = nodes[ROUND_POTENTIAL - 1 - i];         // drain right-to-left
    node.className =
      i < lostTime                ? 'pdot spent-time'     :
      i < lostTime + lostDist     ? 'pdot spent-distance' :
                                    'pdot';
  }
}

function hardReset() {
  clearScheduled();
  stopTimer();
  S = mkState();
}

function begin() {
  dismissIosHint();
  hardReset();
  S.phase = 'countdown';
  showBoard();
  updateUI();

  dom.countdown.hidden = false;
  dom.countdownText.textContent = 'Ready?';
  draw();

  schedule(() => { dom.countdownText.textContent = 'GO!'; }, 500);
  schedule(() => { dom.countdown.hidden = true; startRound(1); }, 1000);
}

// ── Recap ────────────────────────────────────────────────────────────────
// Higher is better now — max is MAX_ROUNDS * ROUND_POTENTIAL (100).
const MSGS = {
  legend: ['Unreal — you beat the creator!', 'Legendary performance!', 'Phenomenal accuracy.'],
  great:  ['Outstanding.', 'Fantastic — spatial reasoning top-notch.', 'Amazing run!'],
  solid:  ['Solid run.', 'Good work — respectable.', 'Nicely done.'],
  mid:    ['Decent — room to grow.', 'Keep sharpening.', 'Not bad; push for more.'],
  low:    ["Nice try — you've got more in you.", 'Focus on the easy rounds.', 'Steady effort; keep pushing.'],
};
const recapMsg = (score) => {
  const pool =
    score >= 90 ? MSGS.legend :
    score >= 70 ? MSGS.great  :
    score >= 50 ? MSGS.solid  :
    score >= 30 ? MSGS.mid    :
                  MSGS.low;
  return pool[Math.floor(Math.random() * pool.length)];
};

function showRecap() {
  S.phase = 'recap';
  const h = S.history;
  const max   = MAX_ROUNDS * ROUND_POTENTIAL;
  const total = S.totalScore;

  // Hard Mode unlock check — one-time event when total first crosses 91.
  const newlyUnlocked = total >= UNLOCK_AT && !hardUnlocked;
  if (newlyUnlocked) {
    hardUnlocked = true;
    localStorage.setItem('kc-hard-unlocked', '1');
    syncHardToggle();
  }
  dom.unlockBanner.hidden = !newlyUnlocked;
  const avg   = h.length ? (h.reduce((s, r) => s + r.roundPoints, 0) / h.length).toFixed(1) : '0.0';
  const avgT  = h.length ? (h.reduce((s, r) => s + r.timer, 0) / h.length).toFixed(1) : '0.0';
  const perf  = h.filter(r => r.perfect).length;

  dom.recapMsg.textContent     = recapMsg(total);
  dom.recapTotal.textContent   = `${total} / ${max} points`;
  dom.recapPerfect.textContent = String(perf);
  dom.recapAvg.textContent     = avg;
  dom.recapTime.textContent    = avgT;

  dom.recapRounds.innerHTML = h.map(r => {
    const sign = r.roundPoints >= 0 ? '+' : '−';
    const val  = Math.abs(r.roundPoints);
    const cls  = r.roundPoints === ROUND_POTENTIAL ? 'perfect'
               : r.roundPoints < 0                 ? 'loss'
               :                                     '';
    return `<div class="recap-row">
      <span>Round ${r.round}</span>
      <span class="${cls}">${sign}${val} pts${r.perfect ? ' ✨' : ''}</span>
    </div>`;
  }).join('');

  // Histogram: 11 buckets (0..10 round points). Negative rounds count into 0.
  const buckets = Array.from({ length: ROUND_POTENTIAL + 1 }, (_, i) =>
    h.filter(r => {
      const p = Math.max(0, r.roundPoints);
      return p === i;
    }).length,
  );
  const maxBucket = Math.max(...buckets, 1);
  dom.recapHist.innerHTML = '';
  buckets.forEach((count, i) => {
    const col = document.createElement('div');
    col.className = 'hist-col';
    const bar = document.createElement('div');
    bar.className = 'hist-bar';
    if (i === ROUND_POTENTIAL) bar.classList.add('hist-bar-top');
    bar.style.height = `${Math.round(count / maxBucket * 50)}px`;
    const lbl = document.createElement('span');
    lbl.className = 'hist-lbl';
    lbl.textContent = String(i);
    col.appendChild(bar);
    col.appendChild(lbl);
    dom.recapHist.appendChild(col);
  });

  dom.recapModal.hidden = false;
  updateUI();
}

// ── UI helpers ───────────────────────────────────────────────────────────
function showBoard() {
  dom.idleScreen.hidden    = true;
  dom.canvasWrap.hidden    = false;
  dom.pregrid.hidden       = false;
  dom.scoreRow.hidden      = false;
  dom.hudDiff.hidden       = false;
  dom.hudTimerWrap.hidden  = false;
  dom.hardToggle.hidden    = true;       // hide toggle during play
  sizeBoard();
}
function hideBoard() {
  dom.idleScreen.hidden    = false;
  dom.canvasWrap.hidden    = true;
  dom.pregrid.hidden       = true;
  dom.scoreRow.hidden      = true;
  dom.hudDiff.hidden       = true;
  dom.hudTimerWrap.hidden  = true;
  hideHalo();
  syncHardToggle();                       // restore toggle visibility on idle
}

// ── Halo timer ───────────────────────────────────────────────────────────
// Pure CSS animation: 3s shrink, green → amber → red. Re-triggered by
// removing then re-adding the running class with a forced reflow between.
function startHalo() {
  dom.halo.classList.remove('halo-running');
  void dom.halo.offsetWidth;
  dom.halo.classList.add('halo-running');
}
function hideHalo() {
  dom.halo.classList.remove('halo-running');
}

// Unicode round-progress bar — 20 chars wide, 2 per round.
// `round` is the round currently being played (1..MAX_ROUNDS) or 0 before start.
const IDLE_SUBTITLE = '10 rounds · score up to 100';
function progressBarHTML(round) {
  const segs   = MAX_ROUNDS;
  const filled = Math.max(0, Math.min(segs, round));
  return (
    `<span class="bar-filled">${'█'.repeat(filled * 2)}</span>` +
    `<span class="bar-empty">${'▒'.repeat((segs - filled) * 2)}</span>`
  );
}

function updateUI() {
  const p = S.phase;

  // Subtitle: idle text on the welcome screen, progress bar everywhere else.
  if (p === 'idle') {
    dom.subtitle.textContent = IDLE_SUBTITLE;
    dom.subtitle.classList.remove('progress');
  } else {
    dom.subtitle.innerHTML = progressBarHTML(S.round);
    dom.subtitle.classList.add('progress');
  }

  if (p === 'playing' || p === 'downtime' || p === 'countdown') {
    const r = Math.max(S.round, 1);
    const diff = diffFor(r);
    dom.hudDiff.textContent = diff.name;
    dom.hudDiff.style.color = diff.color;

    const secs = S.timer;
    dom.hudTimer.textContent = `0:${String(secs).padStart(2, '0')}`;
    dom.hudTimer.style.color = secs <= PENALTY_AT ? COLORS.optimal : COLORS.guessHit;

    if (S.penalty > 0) {
      dom.hudPenalty.hidden = false;
      dom.hudPenalty.textContent = ` −${S.penalty}`;
    } else {
      dom.hudPenalty.hidden = true;
    }
    renderPotentialDots();
  }

  dom.total.textContent = String(S.totalScore);

  const btn = dom.actionBtn;
  btn.classList.remove('is-validate');
  if (p === 'idle') {
    btn.disabled = false;
    dom.btnLabel.textContent = 'START GAME';
  } else if (p === 'playing' && S.guess && !S.showResult) {
    btn.disabled = false;
    btn.classList.add('is-validate');
    dom.btnLabel.textContent = 'VALIDATE';
  } else {
    btn.disabled = true;
    dom.btnLabel.textContent = p === 'idle' ? 'START GAME' : 'PLACE GUESS';
  }

  if      (p === 'idle')                                dom.hint.textContent = 'Tap START GAME to begin';
  else if (p === 'playing' && !S.guess)                 dom.hint.textContent = 'Tap a cell to place your guess';
  else if (p === 'playing' && S.guess && !S.showResult) dom.hint.textContent = 'Tap same cell or VALIDATE to confirm';
  else                                                  dom.hint.textContent = '…';
}

// ── Buttons ──────────────────────────────────────────────────────────────
dom.actionBtn.addEventListener('click', () => {
  if (S.phase === 'idle')                                     begin();
  else if (S.phase === 'playing' && S.guess && !S.showResult) validate();
});

dom.btnPlayAgain.addEventListener('click', () => {
  dom.recapModal.hidden = true;
  hardReset();
  hideBoard();
  updateUI();
});

dom.recapModal.addEventListener('click', (e) => {
  if (e.target instanceof HTMLElement && e.target.dataset.close !== undefined) {
    dom.recapModal.hidden = true;
  }
});

dom.btnLink.addEventListener('click', async () => {
  const url = location.href;
  try {
    if (navigator.share && isCoarse) {
      await navigator.share({ title: 'KikaCentroid', url });
    } else {
      await navigator.clipboard.writeText(url);
    }
    flashTbtn(dom.btnLink, 'Copied!');
  } catch (_) { /* user cancelled */ }
});

dom.btnShare.addEventListener('click', async () => {
  const text = `KikaCentroid — scored ${S.totalScore} points across ${MAX_ROUNDS} rounds.`;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'KikaCentroid', text, url: location.href });
    } else {
      await navigator.clipboard.writeText(`${text}\n${location.href}`);
      flashTbtn(dom.btnShare, 'Copied!');
    }
  } catch (_) { /* user cancelled */ }
});

function flashTbtn(btn, msg, ms = 1500) {
  const orig = btn.textContent;
  btn.textContent = msg;
  setTimeout(() => { btn.textContent = orig; }, ms);
}

// ── Sample canvas (idle illustration) ────────────────────────────────────
(function drawSample() {
  const SGRID = 11, SCELL = 14, SPX = SGRID * SCELL;
  const sc = dom.sample;
  sc.width        = SPX * DPR;
  sc.height       = SPX * DPR;
  sc.style.width  = SPX + 'px';
  sc.style.height = SPX + 'px';
  const sx = sc.getContext('2d');
  sx.setTransform(DPR, 0, 0, DPR, 0, 0);

  const sampleDots = [
    { x: 2, y: 2 }, { x: 3, y: 7 }, { x: 5, y: 4 },
    { x: 7, y: 2 }, { x: 8, y: 8 }, { x: 2, y: 9 },
  ];
  const sc2  = centroid(sampleDots);
  const sOpt = { x: Math.round(sc2.x), y: Math.round(sc2.y) };
  const sGuess = { x: Math.min(SGRID - 1, sOpt.x + 1), y: sOpt.y };

  sx.fillStyle = COLORS.bg;
  sx.fillRect(0, 0, SPX, SPX);
  sx.strokeStyle = COLORS.grid;
  sx.lineWidth = 0.5;
  for (let i = 0; i <= SGRID; i++) {
    sx.beginPath(); sx.moveTo(i * SCELL, 0);    sx.lineTo(i * SCELL, SPX); sx.stroke();
    sx.beginPath(); sx.moveTo(0, i * SCELL);    sx.lineTo(SPX, i * SCELL); sx.stroke();
  }
  sx.strokeStyle = COLORS.vector;
  sx.lineWidth   = 1.5;
  for (const d of sampleDots) {
    sx.beginPath();
    sx.moveTo(d.x * SCELL + SCELL / 2, d.y * SCELL + SCELL / 2);
    sx.lineTo(sOpt.x * SCELL + SCELL / 2, sOpt.y * SCELL + SCELL / 2);
    sx.stroke();
  }
  sx.fillStyle = COLORS.dot;
  for (const d of sampleDots) sx.fillRect(d.x * SCELL + 2, d.y * SCELL + 2, SCELL - 4, SCELL - 4);
  sx.fillStyle = COLORS.guessHit;
  sx.fillRect(sGuess.x * SCELL + 2, sGuess.y * SCELL + 2, SCELL - 4, SCELL - 4);
  sx.fillStyle = COLORS.optimal;
  sx.fillRect(sOpt.x * SCELL + 2, sOpt.y * SCELL + 2, SCELL - 4, SCELL - 4);
})();

// ── Hard Mode toggle ─────────────────────────────────────────────────────
function syncHardToggle() {
  dom.hardToggle.hidden = !hardUnlocked;
  dom.hardToggle.textContent = `Hard Mode: ${hardMode ? 'On' : 'Off'}`;
  dom.hardToggle.classList.toggle('on', hardMode);
}
dom.hardToggle.addEventListener('click', () => {
  if (!hardUnlocked) return;
  hardMode = !hardMode;
  localStorage.setItem('kc-hard-mode-on', hardMode ? '1' : '0');
  syncHardToggle();
});
syncHardToggle();

// ── Initial paint ────────────────────────────────────────────────────────
sizeBoard();
updateUI();

// ── Install prompt (Chromium / Android) ──────────────────────────────────
let deferredInstall = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  if (sessionStorage.getItem('kc-install-dismissed')) return;
  dom.btnInstall.hidden = false;
});

dom.btnInstall.addEventListener('click', async () => {
  if (!deferredInstall) return;
  dom.btnInstall.hidden = true;
  deferredInstall.prompt();
  const { outcome } = await deferredInstall.userChoice;
  if (outcome === 'dismissed') sessionStorage.setItem('kc-install-dismissed', '1');
  deferredInstall = null;
});

window.addEventListener('appinstalled', () => {
  dom.btnInstall.hidden = true;
  deferredInstall = null;
});

// ── iOS A2HS hint (Safari only, never installed) ─────────────────────────
const isStandalone =
  matchMedia('(display-mode: standalone)').matches ||
  // iOS-specific
  // @ts-ignore - non-standard
  window.navigator.standalone === true;

const ua = navigator.userAgent;
const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);

let iosHintTimer = null;
function dismissIosHint() {
  if (iosHintTimer) { clearTimeout(iosHintTimer); iosHintTimer = null; }
  if (dom.iosHint.hidden) return;
  dom.iosHint.hidden = true;
  localStorage.setItem('kc-ios-hint-dismissed', '1');
}
if (isIOS && isSafari && !isStandalone && !localStorage.getItem('kc-ios-hint-dismissed')) {
  iosHintTimer = setTimeout(() => { dom.iosHint.hidden = false; }, 2500);
}
// Tap anywhere on the hint dismisses it (including the × close button,
// which bubbles up). Press START GAME also dismisses — wired in begin().
dom.iosHint.addEventListener('click', dismissIosHint);

// ── Service worker registration ──────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });

      // If a worker is already waiting on first load, surface the toast.
      if (reg.waiting && navigator.serviceWorker.controller) {
        showUpdateToast(reg.waiting);
      }

      reg.addEventListener('updatefound', () => {
        const incoming = reg.installing;
        if (!incoming) return;
        incoming.addEventListener('statechange', () => {
          if (incoming.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateToast(incoming);
          }
        });
      });

      // After SKIP_WAITING handler fires inside the SW, the new SW takes
      // control — reload once so the page matches the new asset graph.
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return;
        reloaded = true;
        location.reload();
      });

      // Periodically check for updates (every 30 min while the tab is open).
      setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
    } catch (err) {
      console.warn('[KikaCentroid] SW registration failed', err);
    }
  });
}

function showUpdateToast(worker) {
  dom.toast.hidden = false;
  dom.btnRefresh.onclick = () => {
    dom.toast.hidden = true;
    worker.postMessage({ type: 'SKIP_WAITING' });
  };
}
dom.btnToastClose.addEventListener('click', () => { dom.toast.hidden = true; });
