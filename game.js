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

// ── Seeding & PRNG ───────────────────────────────────────────────────────
// Format: xxx-yyy-NNN — two pronouncable letter syllables + 3-digit suffix.
// User-typed input is permissive (any 3+3+3); auto-gen is constrained to
// pronouncable syllables (CVC or VCV mix), with a tiny profanity blocklist.
//
// Gameplay rng() routes through Mulberry32 when a seed is active. Without a
// seed it stays as Math.random() — default behavior unchanged.

function mulberry32(a) {
  return function() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeedString(s) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  return h1 >>> 0;
}

const SYL_C = 'bcdfghjklmnpqrstvwxz';
const SYL_V = 'aeiou';
const SEED_BLOCKLIST = new Set([
  'ass','arse','tit','fuk','sex','gay','jew','nig','fag','cum','pee',
  'poo','dik','vag','bum','wog','hoe','hor','suk','jiz',
]);
function pickSyllable() {
  while (true) {
    const useVCV = Math.random() < 0.4;
    const c = () => SYL_C[Math.floor(Math.random() * SYL_C.length)];
    const v = () => SYL_V[Math.floor(Math.random() * SYL_V.length)];
    const s = useVCV ? v() + c() + v() : c() + v() + c();
    if (!SEED_BLOCKLIST.has(s)) return s;
  }
}
function generateRandomSeed() {
  const n = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `${pickSyllable()}-${pickSyllable()}-${n}`;
}

const SEED_RE = /^[a-z]{3}-[a-z]{3}-\d{3}$/;
function normalizeSeed(input) {
  if (!input) return null;
  let s = String(input).trim().toLowerCase().replace(/\s+/g, '');
  // Accept "akasop921" → "aka-sop-921".
  if (/^[a-z]{6}\d{3}$/.test(s)) s = `${s.slice(0, 3)}-${s.slice(3, 6)}-${s.slice(6)}`;
  return SEED_RE.test(s) ? s : null;
}

function readSeedFromHash() {
  const m = location.hash.match(/[#&]s=([^&]+)/);
  return m ? normalizeSeed(decodeURIComponent(m[1])) : null;
}
function writeSeedToHash(seed) {
  const base = location.pathname + location.search;
  history.replaceState(null, '', seed ? `${base}#s=${seed}` : base);
}

// Replay tracking: localStorage map of {seed: attemptCount}. Bumped on
// each begin() of a seeded run.
const REPLAY_KEY = 'kc-seed-attempts';
function bumpReplay(seed) {
  let map = {};
  try { map = JSON.parse(localStorage.getItem(REPLAY_KEY) || '{}'); } catch (_) {}
  map[seed] = (map[seed] || 0) + 1;
  try { localStorage.setItem(REPLAY_KEY, JSON.stringify(map)); } catch (_) {}
  return map[seed];
}
function getReplayCount(seed) {
  if (!seed) return 0;
  try {
    const map = JSON.parse(localStorage.getItem(REPLAY_KEY) || '{}');
    return map[seed] || 0;
  } catch (_) { return 0; }
}

// Active gameplay RNG. Set by begin() based on pendingSeed.
let rng = Math.random;
function setRng(seed) {
  rng = seed ? mulberry32(hashSeedString(seed)) : Math.random;
}

// Pending seed staged via the "+" panel or URL hash, consumed by begin().
let pendingSeed = null;
let pendingSeedOrigin = 'random';        // 'random' | 'self' | 'foreign'

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
    perfectStreak: 0,
    seed:        null,            // active seed for this run (or null)
    seedOrigin:  'random',        // 'random' | 'self' | 'foreign'
    seedAttempt: 0,               // device's Nth play of this seed (0 if no seed)
    longShotRound: 0,             // round nr that gets the long-shot puzzle
  };
}

// Hype callouts — fire on consecutive spotless (10/10) rounds, tier ≥ 2.
// Tier 10 is the flawless-run cap and also triggers the full-screen overlay
// + recap title transformation.
const HYPE_TIERS = [
  null, null,
  { label: 'Duo!' },
  { label: 'Triple!' },
  { label: '四連続!' },
  { label: 'ペンタキル!' },
  { label: 'Sex-tuple!' },
  { label: 'Heptapod!' },
  { label: 'Octopus!' },
  { label: 'Penultimate!' },
  { label: 'PERFECT!' },
];

let S = mkState();
let timerInterval = null;
const timeouts = [];
let cellPx = 20;            // current CSS px per cell, recomputed on resize
let boardPx = GRID * cellPx;

// Hard Mode persistence — unlock once the user breaks 91 total points.
let hardUnlocked = localStorage.getItem('kc-hard-unlocked') === '1';
let hardMode     = hardUnlocked && localStorage.getItem('kc-hard-mode-on') === '1';
const UNLOCK_AT  = 91;

// Tap a cell = place + auto-validate after a brief delay so the orange
// guess marker registers visually before the validate flash.
const COMMIT_DELAY_MS = 100;
// Clean up legacy preference key from when this was a toggleable mode.
try { localStorage.removeItem('kc-oneshot-on'); } catch (_) {}

// DEBUG mode (?debug=1) — paints the true centroid in light-grey before
// validate, so tier behavior can be exercised without grinding skill.
const DEBUG = new URLSearchParams(location.search).get('debug') === '1';

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

// Standard mode: EASY → MEDIUM → HARD, uniform-random dot placement.
// Hard Mode (unlocked at total ≥ 91): only modestly more dots than standard,
// but the dots come from skewed distributions (cluster+outlier, two
// asymmetric clusters, corner-heavy). Skew is the difficulty, not count.
const diffFor = (round) => {
  if (hardMode) {
    if (round <= 3) return { name: 'HARD',    min: 5,  max: 9,  color: '#ff4444' };
    if (round <= 7) return { name: 'EXTREME', min: 7,  max: 12, color: '#ff1a1a' };
    return                 { name: 'INSANE',  min: 10, max: 14, color: '#ff0088' };
  }
  if (round <= 3) return { name: 'EASY',   min: 3, max: 8,  color: '#00ff88' };
  if (round <= 7) return { name: 'MEDIUM', min: 5, max: 10, color: '#ffaa00' };
  return                 { name: 'HARD',   min: 7, max: 12, color: '#ff4444' };
};

// ── Distribution helpers ─────────────────────────────────────────────────
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function gaussian(stddev = 1) {
  // Box-Muller — one sample from N(0, stddev²)
  const u1 = Math.max(rng(), 1e-9);
  const u2 = rng();
  return stddev * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function generateUniformDots(n) {
  const used = new Set();
  const dots = [];
  while (dots.length < n) {
    const x = Math.floor(rng() * GRID);
    const y = Math.floor(rng() * GRID);
    const k = `${x},${y}`;
    if (used.has(k)) continue;
    used.add(k);
    dots.push({ x, y });
  }
  return dots;
}

// Try to add a unique gaussian-sampled dot near (cx, cy). Bounded retries
// so a tightly packed cluster can't deadlock the loop.
function addGaussianDot(dots, used, cx, cy, sigma, max = 80) {
  for (let i = 0; i < max; i++) {
    const x = clamp(Math.round(cx + gaussian(sigma)), 0, GRID - 1);
    const y = clamp(Math.round(cy + gaussian(sigma)), 0, GRID - 1);
    const k = `${x},${y}`;
    if (used.has(k)) continue;
    used.add(k);
    dots.push({ x, y });
    return true;
  }
  return false;
}

function fillRandom(dots, used, target, predicate, max = 400) {
  let attempts = 0;
  while (dots.length < target && attempts++ < max) {
    const x = Math.floor(rng() * GRID);
    const y = Math.floor(rng() * GRID);
    if (predicate && !predicate(x, y)) continue;
    const k = `${x},${y}`;
    if (used.has(k)) continue;
    used.add(k);
    dots.push({ x, y });
  }
}

// Pattern A — tight cluster + far outliers. Centroid drifts toward the
// outliers but the eye sees the cluster as the visual mass.
function patternClusterOutlier(n) {
  const dots = [], used = new Set();
  const cx = 3 + Math.floor(rng() * (GRID - 6));
  const cy = 3 + Math.floor(rng() * (GRID - 6));
  const sigma = 1.2 + rng() * 0.6;
  const numCluster = Math.max(2, Math.floor(n * (0.7 + rng() * 0.15)));
  for (let i = 0; i < numCluster && dots.length < n; i++) {
    addGaussianDot(dots, used, cx, cy, sigma);
  }
  fillRandom(dots, used, n, (x, y) => Math.hypot(x - cx, y - cy) >= 5);
  // If outlier-distance constraint shut us out, fill the rest anywhere.
  fillRandom(dots, used, n);
  return dots;
}

// Pattern B — two clusters of unequal size. The DOMINANT cluster is pinned
// to an edge quadrant; the smaller satellite floats elsewhere. With a 70–90%
// weight skew, the centroid lands close to the dominant cluster (off-centre)
// instead of cancelling at the grid middle.
function patternBiCluster(n) {
  const dots = [], used = new Set();
  const quadrant = Math.floor(rng() * 4);
  const bigCx = (quadrant & 1) ? GRID - 3 - Math.floor(rng() * 3) : 2 + Math.floor(rng() * 3);
  const bigCy = (quadrant & 2) ? GRID - 3 - Math.floor(rng() * 3) : 2 + Math.floor(rng() * 3);
  // Satellite: anywhere not adjacent to the dominant cluster.
  let smallCx, smallCy, attempts = 0;
  do {
    smallCx = 1 + Math.floor(rng() * (GRID - 2));
    smallCy = 1 + Math.floor(rng() * (GRID - 2));
    attempts++;
  } while (Math.hypot(smallCx - bigCx, smallCy - bigCy) < 6 && attempts < 30);

  const ratio = 0.70 + rng() * 0.20;       // 70–90% in dominant
  const nBig  = Math.max(2, Math.floor(n * ratio));
  const sigma = 1.0 + rng() * 0.5;
  for (let i = 0; i < nBig && dots.length < n; i++) {
    addGaussianDot(dots, used, bigCx, bigCy, sigma);
  }
  while (dots.length < n) {
    if (!addGaussianDot(dots, used, smallCx, smallCy, sigma)) break;
  }
  fillRandom(dots, used, n);
  return dots;
}

// Pattern C — most dots crammed into one corner with a few stragglers.
// The visual bias screams "corner!" but stragglers shift the centroid.
function patternCornerHeavy(n) {
  const dots = [], used = new Set();
  const corner = Math.floor(rng() * 4);
  const cx = (corner & 1) ? GRID - 3 - Math.floor(rng() * 3) : 2 + Math.floor(rng() * 3);
  const cy = (corner & 2) ? GRID - 3 - Math.floor(rng() * 3) : 2 + Math.floor(rng() * 3);
  const sigma = 1.4 + rng() * 0.4;
  const numCorner = Math.max(2, Math.floor(n * (0.65 + rng() * 0.15)));
  for (let i = 0; i < numCorner && dots.length < n; i++) {
    addGaussianDot(dots, used, cx, cy, sigma);
  }
  fillRandom(dots, used, n);
  return dots;
}

function generateSkewedDots(n) {
  const r = rng();
  if (r < 0.40) return patternClusterOutlier(n);
  if (r < 0.75) return patternBiCluster(n);
  return                patternCornerHeavy(n);
}

// Long-shot pattern — one of these is guaranteed to fire per run, regardless
// of difficulty mode. 3-4 dots tightly clustered at an edge/corner, plus 1-2
// outliers in the opposite quadrant. The visual mass screams "cluster" but
// the centroid drifts hard toward the outlier — so when you nail it, big
// dopamine. Returns its own dot count, ignoring difficulty's range.
function generateLongShotDots() {
  const dots = [], used = new Set();
  const numCluster  = 3 + Math.floor(rng() * 2);          // 3 or 4
  const numOutliers = 1 + (rng() < 0.35 ? 1 : 0);         // 1, sometimes 2

  // 8 anchor positions: 4 edges + 4 corners.
  const place = Math.floor(rng() * 8);
  const near = 1 + Math.floor(rng() * 2);                 // 1-2 cells from edge
  const far  = GRID - 1 - near;
  const mid  = Math.floor(GRID / 2);
  let cx, cy;
  if      (place === 0) { cx = mid;  cy = near; }         // top edge
  else if (place === 1) { cx = far;  cy = mid;  }         // right edge
  else if (place === 2) { cx = mid;  cy = far;  }         // bottom edge
  else if (place === 3) { cx = near; cy = mid;  }         // left edge
  else if (place === 4) { cx = near; cy = near; }         // top-left
  else if (place === 5) { cx = far;  cy = near; }         // top-right
  else if (place === 6) { cx = far;  cy = far;  }         // bottom-right
  else                  { cx = near; cy = far;  }         // bottom-left

  // Tight cluster.
  for (let i = 0; i < numCluster; i++) {
    addGaussianDot(dots, used, cx, cy, 0.7);
  }
  // Opposite outliers — mirror across the grid centre.
  const ox = GRID - 1 - cx;
  const oy = GRID - 1 - cy;
  for (let i = 0; i < numOutliers; i++) {
    addGaussianDot(dots, used, ox, oy, 0.6);
  }
  return dots;
}

// ── DOM refs ─────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const dom = {
  canvas:        $('grid-canvas'),
  sample:        $('sample-canvas'),
  canvasWrap:    $('canvas-wrapper'),
  pregrid:       $('pregrid'),
  potentialDots: $('potential-dots'),
  halo:          $('halo'),
  btnReset:      $('btn-reset'),
  scoreRow:      $('score-row'),
  idleScreen:    $('idle-screen'),
  subtitle:      $('subtitle'),
  hudDiff:       $('hud-diff'),
  hudTimerWrap:  $('hud-timer-wrap'),
  hudTimer:      $('hud-timer'),
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
  recapHistory:  $('recap-history'),
  btnPlayAgain:  $('btn-play-again'),
  btnShare:      $('btn-share'),
  btnLink:       $('btn-link'),
  btnInstall:    $('btn-install'),
  iosHint:       $('ios-install-hint'),
  iosHintClose:  $('ios-hint-close'),
  resetOverlay:  $('reset-overlay'),
  toast:         $('update-toast'),
  btnRefresh:    $('btn-refresh'),
  btnToastClose: $('btn-toast-close'),
  hardToggle:    $('hard-toggle'),
  unlockBanner:  $('unlock-banner'),
  recapTitle:    $('recap-title'),
  streakFlash:   $('streak-flash'),
  perfectOverlay: $('perfect-overlay'),
  seedPanel:     $('seed-panel'),
  seedInput:     $('seed-input'),
  seedUse:       $('seed-use'),
  seedRandom:    $('seed-random'),
  seedClear:     $('seed-clear'),
  seedActive:    $('seed-active'),
  seedActiveVal: $('seed-active-val'),
  seedActiveMeta: $('seed-active-meta'),
  seedError:     $('seed-error'),
  recapSeed:     $('recap-seed'),
  recapSeedVal:  $('recap-seed-val'),
  recapSeedTag:  $('recap-seed-tag'),
  btnCopyChallenge: $('btn-copy-challenge'),
  runModal:      $('run-modal'),
  runModalTitle: $('run-modal-title'),
  runModalScore: $('run-modal-score'),
  runModalMode:  $('run-modal-mode'),
  runModalWhen:  $('run-modal-when'),
  runModalSeedRow: $('run-modal-seed-row'),
  runModalSeed:    $('run-modal-seed'),
  runModalTagRow:  $('run-modal-tag-row'),
  runModalTag:     $('run-modal-tag'),
  runModalCopy:    $('run-modal-copy'),
  runModalReplay:  $('run-modal-replay'),
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

  // DEBUG: light-grey centroid hint before validate. Painted under guess
  // so the orange/red guess marker stays the visually dominant cell.
  if (DEBUG && S.optimal && !S.showResult && S.phase === 'playing') {
    ctx.fillStyle = 'rgba(220, 220, 220, 0.45)';
    ctx.fillRect(S.optimal.x * cellPx + 3, S.optimal.y * cellPx + 3, cellPx - 6, cellPx - 6);
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
  if (S.guess) return;          // already committed this round; ignore extra taps
  const cell = cellAt(e);
  if (!cell) return;
  e.preventDefault();
  // Place + commit in one motion. Brief delay so the orange marker
  // registers visually before the validate flash.
  S.guess = cell;
  updateUI(); draw();
  schedule(validate, COMMIT_DELAY_MS);
});

// ── Game logic ───────────────────────────────────────────────────────────
function startRound(nr) {
  const diff = diffFor(nr);
  // Long-shot rounds override difficulty's dot count — the pattern is the
  // point, not the dot count. RNG draws happen unconditionally so seeded
  // runs stay consistent regardless of which round was chosen.
  const n    = diff.min + Math.floor(rng() * (diff.max - diff.min + 1));
  const dots = (nr === S.longShotRound) ? generateLongShotDots()
             : hardMode                  ? generateSkewedDots(n)
             :                             generateUniformDots(n);
  const c    = centroid(dots);

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

  // Streak: spotless extends, anything else breaks it.
  if (spotless) S.perfectStreak++;
  else          S.perfectStreak = 0;
  if (S.perfectStreak >= 2) showStreakCallout(S.perfectStreak);

  renderPotentialDots();                                // flash the distance dots red
  updateUI(); draw();

  // Tier 10 = flawless run; let the overlay breathe before the recap modal.
  const postDelay = S.perfectStreak >= MAX_ROUNDS ? 3000 : 1000;
  schedule(() => {
    dom.ptsFlash.hidden = true;
    const next = S.round + 1;
    if (next <= MAX_ROUNDS) {
      schedule(() => startRound(next), 180);
    } else {
      showRecap();
    }
  }, postDelay);
}

function showStreakCallout(tier) {
  const cfg = HYPE_TIERS[Math.min(tier, HYPE_TIERS.length - 1)];
  if (!cfg) return;
  const el = dom.streakFlash;
  el.className = 'streak-flash';                        // reset tier classes
  el.classList.add(`tier-${tier}`);                     // apply BEFORE measuring
  el.textContent = cfg.label;

  // Anchor 2 cells above the guess. Horizontal: clamp so the scaled label
  // stays inside the canvas frame — long labels at high tiers (e.g.
  // "Penultimate!" at 2.7×) would otherwise extend off-canvas.
  if (S.guess) {
    const scale = parseFloat(getComputedStyle(el).getPropertyValue('--streak-scale')) || 1.5;
    // Monospace label width estimate at base 22px font.
    const halfLabelPx = (cfg.label.length * 22 * 0.6 * scale) / 2;
    const ideal = (S.guess.x + 0.5) * cellPx;
    const minL  = halfLabelPx;
    const maxL  = boardPx - halfLabelPx;
    const left  = (minL > maxL) ? boardPx / 2
                                : Math.max(minL, Math.min(maxL, ideal));
    el.style.top  = `${(S.guess.y - 2) * cellPx}px`;
    el.style.left = `${left}px`;
  }
  void el.offsetWidth;                                  // restart animation
  el.classList.add('show');
  el.hidden = false;
  schedule(() => {
    el.hidden = true;
    el.classList.remove('show');
  }, 2900);                                             // covers longest tier dur

  if (tier >= MAX_ROUNDS) {
    dom.perfectOverlay.hidden = false;
    schedule(() => { dom.perfectOverlay.hidden = true; }, 2800);
  }
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

  // Every run gets a seed for shareability. Use the user-staged seed from
  // the "+" panel or URL hash if there is one; otherwise auto-generate one
  // in the background and treat it as 'self' (the user produced it, even
  // if implicitly).
  if (pendingSeed) {
    S.seed = pendingSeed;
    S.seedOrigin = pendingSeedOrigin;
  } else {
    S.seed = generateRandomSeed();
    S.seedOrigin = 'self';
  }
  S.seedAttempt = bumpReplay(S.seed);
  setRng(S.seed);

  // Consume the staged seed. Without this, an abandon → idle → START path
  // would silently re-use the same seed even though the user didn't
  // re-stage it. Play Again has its own clearing logic and stays the path
  // for "fresh start with placeholder rotation"; here we just clear the
  // module vars so the next implicit begin() auto-generates.
  pendingSeed = null;
  pendingSeedOrigin = 'random';
  refreshSeedPanel();

  // Pick the long-shot round AFTER setting the RNG — so seeded runs get the
  // same surprise round as anyone else with that seed.
  S.longShotRound = 1 + Math.floor(rng() * MAX_ROUNDS);

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
// Replays are practice runs — knock the message tier down one step so a
// 95-on-replay doesn't get the same hype as a fresh 95.
const recapMsg = (score, isReplay = false) => {
  const adj = isReplay ? -10 : 0;
  const s = score + adj;
  const pool =
    s >= 90 ? MSGS.legend :
    s >= 70 ? MSGS.great  :
    s >= 50 ? MSGS.solid  :
    s >= 30 ? MSGS.mid    :
              MSGS.low;
  return pool[Math.floor(Math.random() * pool.length)];
};

// ── Run history (sparkline) ──────────────────────────────────────────────
const HISTORY_CAP = 10;
const HISTORY_KEY = 'kc-history';

// Score tier ladder — orange in the 80s ramps through green → cyan → blue
// with a finer-grained gradient at the top. Used by sparkline + recap total.
function scoreTierClass(s) {
  if (s >= 100) return 's-100';
  if (s >= 98)  return 's-98';
  if (s >= 96)  return 's-96';
  if (s >= 94)  return 's-94';
  if (s >= 92)  return 's-92';
  if (s >= 90)  return 's-90';
  if (s >= 80)  return 's-80';
  if (s >= 70)  return 's-70';
  if (s >= 50)  return 's-50';
  return              's-low';
}

function pushRunHistory(totalScore, hard, seed = null, attempt = 0, origin = null) {
  let h = [];
  try { h = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (_) {}
  h.push({
    total: totalScore,
    hard: !!hard,
    ts: Date.now(),
    seed: seed || undefined,
    attempt: attempt || undefined,
    origin: origin || undefined,
  });
  if (h.length > HISTORY_CAP) h = h.slice(-HISTORY_CAP);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); } catch (_) {}
  return h;
}
function readHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
  catch (_) { return []; }
}

function renderRunHistory(history) {
  const el = dom.recapHistory;
  if (!history || !history.length) {
    el.innerHTML = '<span class="empty">No runs yet</span>';
    return;
  }
  const tierClass = scoreTierClass;
  const last = history.length - 1;
  // Oldest on the left → newest on the right, with › between to lead the
  // eye toward the latest run (also bolded + underlined via .s-current).
  // Seeded fresh attempts get a ◆ prefix; replays get ↻N. Random runs are
  // unmarked — the absence of a glyph is itself the signal.
  el.innerHTML = history.map((r, i) => {
    const cls = [
      tierClass(r.total),
      r.hard    ? 's-hard'    : '',
      i === last ? 's-current' : '',
    ].filter(Boolean).join(' ');
    let prefix = '';
    if (r.seed) {
      prefix = (r.attempt && r.attempt > 1)
        ? `<span class="s-replay">↻${r.attempt}</span>`
        : `<span class="s-fresh">◆</span>`;
    }
    return `<button type="button" class="run-link" data-idx="${i}" aria-label="Run ${i + 1} details">${prefix}<span class="${cls}">${r.total}</span></button>`;
  }).join(' <span class="s-arrow">›</span> ');
}

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

  // Append this run to recent-history and render the sparkline.
  const recent = pushRunHistory(total, hardMode, S.seed, S.seedAttempt, S.seedOrigin);
  renderRunHistory(recent);
  const avg   = h.length ? (h.reduce((s, r) => s + r.roundPoints, 0) / h.length).toFixed(1) : '0.0';
  const avgT  = h.length ? (h.reduce((s, r) => s + r.timer, 0) / h.length).toFixed(1) : '0.0';
  const perf  = h.filter(r => r.perfect).length;

  const flawless = S.perfectStreak >= MAX_ROUNDS;
  dom.recapTitle.textContent = flawless ? 'PERFECT RUN' : 'Game Over';
  dom.recapTitle.classList.toggle('perfect', flawless);

  dom.recapMsg.textContent     = recapMsg(total, S.seedAttempt > 1);
  dom.recapTotal.textContent   = `${total} / ${max} points`;
  dom.recapTotal.className     = `recap-total ${scoreTierClass(total)}`;
  dom.recapPerfect.textContent = String(perf);
  dom.recapAvg.textContent     = avg;
  dom.recapTime.textContent    = avgT;

  // Seed line: hidden when no seed; otherwise show seed + tag (self / challenge
  // / replay #N) and the Copy Challenge Link button.
  if (S.seed) {
    dom.recapSeed.hidden = false;
    dom.recapSeedVal.textContent = S.seed;
    dom.recapSeedTag.classList.remove('tag-self', 'tag-foreign', 'tag-replay');
    if (S.seedAttempt > 1) {
      dom.recapSeedTag.textContent = `Replay #${S.seedAttempt}`;
      dom.recapSeedTag.classList.add('tag-replay');
    } else if (S.seedOrigin === 'foreign') {
      dom.recapSeedTag.textContent = 'Challenge run';
      dom.recapSeedTag.classList.add('tag-foreign');
    } else {
      dom.recapSeedTag.textContent = 'Self-generated';
      dom.recapSeedTag.classList.add('tag-self');
    }
  } else {
    dom.recapSeed.hidden = true;
  }

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
  // hard-toggle stays visible in toolbar — click is gated by phase check
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
  disarmReset();
  syncHardToggle();
}

// ── RESET button (two-stage) ─────────────────────────────────────────────
// First click: orange → red (armed). Second click within ARM_WINDOW_MS:
// abandon the run, push 0 to history, return to idle. Otherwise reverts.
const ARM_WINDOW_MS = 2000;
let resetArmTimer = null;
function disarmReset() {
  if (resetArmTimer) { clearTimeout(resetArmTimer); resetArmTimer = null; }
  dom.btnReset.classList.remove('armed');
}
function armReset() {
  dom.btnReset.classList.add('armed');
  if (resetArmTimer) clearTimeout(resetArmTimer);
  resetArmTimer = setTimeout(disarmReset, ARM_WINDOW_MS);
}
const RESET_OVERLAY_MS = 1200;
function abandonRun() {
  disarmReset();
  dom.resetOverlay.hidden = false;
  // Snapshot seed metadata BEFORE the timer fires. If a new run begins
  // before the overlay clears (rare, but a backgrounded-then-resumed tab
  // can race), hardReset()'s clearScheduled() will cancel this scheduled
  // call so we don't pollute the next run's seed with a phantom 0.
  const snap = { seed: S.seed, attempt: S.seedAttempt, origin: S.seedOrigin };
  schedule(() => {
    dom.resetOverlay.hidden = true;
    pushRunHistory(0, hardMode, snap.seed, snap.attempt, snap.origin);
    hardReset();
    hideBoard();
    updateUI();
  }, RESET_OVERLAY_MS);
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

  // Subtitle: hidden in idle (the row is reclaimed for vertical space), shows
  // the progress bar during active play.
  if (p === 'idle') {
    dom.subtitle.hidden = true;
    dom.subtitle.classList.remove('progress');
  } else {
    dom.subtitle.hidden = false;
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

    renderPotentialDots();
  }

  dom.total.textContent = String(S.totalScore);

  const btn = dom.actionBtn;
  if (p === 'idle') {
    btn.disabled = false;
    dom.btnLabel.textContent = 'START GAME';
  } else {
    btn.disabled = true;
    dom.btnLabel.textContent = 'PLACE GUESS';
  }

  // Hint: hidden in idle (the START GAME button is self-explanatory),
  // shown during play to guide the user.
  if (p === 'idle') {
    dom.hint.hidden = true;
    dom.hint.textContent = '';
  } else if (p === 'playing' && !S.guess) {
    dom.hint.hidden = false;
    dom.hint.textContent = 'Tap a cell to commit your guess';
  } else {
    dom.hint.hidden = false;
    dom.hint.textContent = '…';
  }
}

// ── Buttons ──────────────────────────────────────────────────────────────
dom.actionBtn.addEventListener('click', () => {
  if (S.phase === 'idle') begin();
});

dom.btnReset.addEventListener('click', () => {
  if (dom.btnReset.classList.contains('armed')) abandonRun();
  else                                          armReset();
});

dom.btnPlayAgain.addEventListener('click', () => {
  dom.recapModal.hidden = true;
  // Play Again is a fresh start — clear any active seed so the next run is
  // either random, or whatever the user re-stages from the "+" panel.
  pendingSeed = null;
  pendingSeedOrigin = 'random';
  dom.seedInput.value = '';
  writeSeedToHash(null);
  refreshSeedPlaceholder();
  refreshSeedPanel();
  hardReset();
  hideBoard();
  updateUI();
});

dom.btnCopyChallenge.addEventListener('click', async () => {
  if (!S.seed) return;
  const url = `${location.origin}${location.pathname}#s=${S.seed}`;
  try {
    await navigator.clipboard.writeText(url);
    flashTbtn(dom.btnCopyChallenge, 'Copied!');
  } catch (_) { /* clipboard blocked */ }
});

dom.recapModal.addEventListener('click', (e) => {
  if (e.target instanceof HTMLElement && e.target.dataset.close !== undefined) {
    dom.recapModal.hidden = true;
  }
});

// ── Run-detail modal ─────────────────────────────────────────────────────
// Opens when a run record in the last-10-runs sparkline is clicked. Shows
// the seed (if any) and offers Copy Challenge Link + Use this seed.
function timeAgo(ts) {
  if (!ts) return '—';
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
function openRunModal(idx) {
  const history = readHistory();
  const r = history[idx];
  if (!r) return;
  dom.runModalTitle.textContent = `Run ${idx + 1} of ${history.length}`;
  dom.runModalScore.textContent = `${r.total} / ${MAX_ROUNDS * ROUND_POTENTIAL}`;
  dom.runModalMode.textContent  = r.hard ? 'Hard' : 'Standard';
  dom.runModalWhen.textContent  = timeAgo(r.ts);

  if (r.seed) {
    dom.runModalSeedRow.hidden = false;
    dom.runModalSeed.textContent = r.seed;
    dom.runModalTagRow.hidden = false;
    dom.runModalTag.classList.remove('tag-self', 'tag-foreign', 'tag-replay');
    if (r.attempt && r.attempt > 1) {
      dom.runModalTag.textContent = `Replay #${r.attempt}`;
      dom.runModalTag.classList.add('tag-replay');
    } else if (r.origin === 'foreign') {
      dom.runModalTag.textContent = 'Challenge run';
      dom.runModalTag.classList.add('tag-foreign');
    } else {
      // 'self' or undefined (legacy records before origin was tracked)
      dom.runModalTag.textContent = 'Self-generated';
      dom.runModalTag.classList.add('tag-self');
    }
    dom.runModalCopy.hidden = false;
    dom.runModalReplay.hidden = false;
    dom.runModalCopy.dataset.seed = r.seed;
    dom.runModalReplay.dataset.seed = r.seed;
  } else {
    dom.runModalSeedRow.hidden = true;
    dom.runModalTagRow.hidden = true;
    dom.runModalCopy.hidden = true;
    dom.runModalReplay.hidden = true;
  }
  dom.runModal.hidden = false;
}
dom.recapHistory.addEventListener('click', (e) => {
  const btn = e.target instanceof HTMLElement ? e.target.closest('.run-link') : null;
  if (!btn) return;
  openRunModal(Number(btn.dataset.idx));
});
dom.runModal.addEventListener('click', (e) => {
  if (e.target instanceof HTMLElement && e.target.dataset.close !== undefined) {
    dom.runModal.hidden = true;
  }
});
dom.runModalCopy.addEventListener('click', async () => {
  const seed = dom.runModalCopy.dataset.seed;
  if (!seed) return;
  const url = `${location.origin}${location.pathname}#s=${seed}`;
  try {
    await navigator.clipboard.writeText(url);
    flashTbtn(dom.runModalCopy, 'Copied!');
  } catch (_) {}
});
dom.runModalReplay.addEventListener('click', () => {
  const seed = dom.runModalReplay.dataset.seed;
  if (!seed) return;
  // Stage as foreign — when replayed, the new run will record attempt > 1
  // and tag "Replay #N" anyway, so origin matters less here.
  setActiveSeed(seed, 'foreign');
  dom.runModal.hidden = true;
  dom.recapModal.hidden = true;
  hardReset();
  hideBoard();
  updateUI();
});

dom.btnLink.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    flashTbtn(dom.btnLink, 'Copied!');
  } catch (_) { /* clipboard blocked */ }
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

// ── Hard Mode toggle (toolbar pill, left of LINK) ────────────────────────
// Pre-unlock: .locked → visibility:hidden, slot reserved so the toolbar
// doesn't shift the moment unlock happens.
function syncHardToggle() {
  dom.hardToggle.classList.toggle('locked', !hardUnlocked);
  dom.hardToggle.classList.toggle('on', hardMode);
  dom.hardToggle.setAttribute('aria-pressed', hardMode ? 'true' : 'false');
  dom.hardToggle.setAttribute('aria-hidden', hardUnlocked ? 'false' : 'true');
  dom.hardToggle.tabIndex = hardUnlocked ? 0 : -1;
  dom.hardToggle.title = hardUnlocked ? `Hard Mode: ${hardMode ? 'On' : 'Off'}` : '';
}
dom.hardToggle.addEventListener('click', () => {
  if (!hardUnlocked) return;
  if (S.phase !== 'idle' && S.phase !== 'recap') return;   // only outside active play
  hardMode = !hardMode;
  localStorage.setItem('kc-hard-mode-on', hardMode ? '1' : '0');
  syncHardToggle();
});
syncHardToggle();

// ── Seed panel ───────────────────────────────────────────────────────────
// Rotate the seed input's placeholder through fresh random samples so the
// hint text doesn't look like a hardcoded default. Called on page load,
// after Play Again, and after Clear.
function refreshSeedPlaceholder() {
  dom.seedInput.placeholder = generateRandomSeed();
}

function refreshSeedPanel() {
  if (pendingSeed) {
    dom.seedActive.hidden = false;
    dom.seedActiveVal.textContent = pendingSeed;
    const label = pendingSeedOrigin === 'foreign' ? 'challenge' : 'self-generated';
    const prior = getReplayCount(pendingSeed);
    const tail  = prior > 0 ? ` · played ${prior}×` : '';
    dom.seedActiveMeta.textContent = `· ${label}${tail}`;
    dom.seedPanel.open = true;     // expose the active seed when one is set
  } else {
    dom.seedActive.hidden = true;
  }
}
function setActiveSeed(seed, origin) {
  pendingSeed = seed;
  pendingSeedOrigin = origin;
  writeSeedToHash(seed);
  refreshSeedPanel();
}
function showSeedError(msg) {
  dom.seedError.hidden = !msg;
  if (msg) dom.seedError.textContent = msg;
}
dom.seedUse.addEventListener('click', () => {
  const raw = dom.seedInput.value;
  const norm = normalizeSeed(raw);
  if (!norm) {
    showSeedError('Format: xxx-yyy-NNN (e.g. aka-sop-921)');
    return;
  }
  showSeedError(null);
  dom.seedInput.value = norm;
  setActiveSeed(norm, 'foreign');     // user-typed is treated as foreign
});
dom.seedRandom.addEventListener('click', () => {
  showSeedError(null);
  const seed = generateRandomSeed();
  dom.seedInput.value = seed;
  setActiveSeed(seed, 'self');
});
dom.seedClear.addEventListener('click', () => {
  pendingSeed = null;
  pendingSeedOrigin = 'random';
  dom.seedInput.value = '';
  showSeedError(null);
  writeSeedToHash(null);
  refreshSeedPlaceholder();
  refreshSeedPanel();
});
dom.seedInput.addEventListener('input', () => showSeedError(null));
dom.seedInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); dom.seedUse.click(); }
});

// ── Seed bootstrap from URL hash ─────────────────────────────────────────
// If the page loaded with #s=aka-sop-921, stage it as a foreign challenge.
// (User-entered or self-generated seeds will overwrite this from the + panel.)
{
  refreshSeedPlaceholder();
  const fromUrl = readSeedFromHash();
  if (fromUrl) {
    pendingSeed = fromUrl;
    pendingSeedOrigin = 'foreign';
    dom.seedInput.value = fromUrl;
  }
  refreshSeedPanel();
}

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
      // Capture whether there was a controller at script-run time: on a
      // first-ever visit the SW activates + clients.claim() and fires
      // controllerchange too, which would reload the page mid-tap and
      // leave the user wondering why START GAME "didn't work."
      const hadController = !!navigator.serviceWorker.controller;
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController) return;          // first install — ignore
        if (reloaded) return;
        reloaded = true;
        location.reload();
      });

      // Periodically check for updates while the tab is visible. Background
      // tabs skip the check (browser timer throttling makes it noisy and
      // there's no point updating a tab the user isn't looking at). Also
      // run an immediate check when the user returns to the tab so they
      // don't have to wait up to 30min for the next interval.
      const checkForUpdate = () => {
        if (document.visibilityState !== 'visible') return;
        reg.update().catch(() => {});
      };
      setInterval(checkForUpdate, 30 * 60 * 1000);
      document.addEventListener('visibilitychange', checkForUpdate);
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

// ── Tutorial ─────────────────────────────────────────────────────────────
// Self-contained mini-canvas inside its own modal: drag dots, watch the
// centroid (green) follow. Real-time math readout. Add/remove dots via
// stepper. Mouse drags immediately; touch needs a 350ms long-press to
// disambiguate from a scroll attempt.
const T_GRID     = 13;
const T_MIN_DOTS = 2;
const T_MAX_DOTS = 8;

const TUTORIAL_DEFAULT_DOTS = [
  { x: 2, y: 3 }, { x: 5, y: 2 }, { x: 8, y: 6 },
  { x: 4, y: 9 }, { x: 10, y: 8 },
];
const tutorial = {
  dots: TUTORIAL_DEFAULT_DOTS.map(d => ({ ...d })),
  selectedIdx: -1,
  cellPx: 22,
  pxSize: 13 * 22,
};

// Demo: a sequence of pre-recorded scenes that interpolate dot positions
// from→to over `duration` ms. All scenes use 5 dots so dot count stays
// fixed across the whole demo. When the demo ends, dots snap back to
// TUTORIAL_DEFAULT_DOTS.
const DEMO_SCENES = [
  {
    caption: 'Everyone converges → so does the centroid.',
    duration: 3500,
    from: [{x:2,y:10},{x:10,y:2},{x:6,y:8},{x:3,y:5},{x:9,y:7}],
    to:   [{x:2,y:2},{x:3,y:2},{x:2,y:3},{x:3,y:3},{x:1,y:2}],
  },
  {
    caption: 'One distant dot pulls the centroid.',
    duration: 3500,
    from: [{x:2,y:2},{x:3,y:2},{x:2,y:3},{x:3,y:3},{x:1,y:2}],
    to:   [{x:2,y:2},{x:3,y:2},{x:2,y:3},{x:3,y:3},{x:11,y:11}],
  },
  {
    caption: 'Symmetric arrangement → centered.',
    duration: 3500,
    from: [{x:2,y:2},{x:3,y:2},{x:2,y:3},{x:3,y:3},{x:11,y:11}],
    to:   [{x:3,y:3},{x:9,y:3},{x:6,y:6},{x:3,y:9},{x:9,y:9}],
  },
  {
    caption: 'Centroid is the running average.',
    duration: 4000,
    from: [{x:3,y:3},{x:9,y:3},{x:6,y:6},{x:3,y:9},{x:9,y:9}],
    to:   [{x:7,y:1},{x:5,y:8},{x:11,y:5},{x:1,y:6},{x:8,y:11}],
  },
];
const demoState = { playing: false, raf: 0, sceneIdx: 0, sceneStart: 0 };
const easeInOut = (t) => t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2;
// Tutorial DOM refs cached once at module top — the tutorialUpdate path
// runs inside the demo's 60fps RAF loop; raw getElementById per-frame is
// wasteful and the abstraction is just architecturally cleaner.
const tDom = {
  canvas:    $('tutorial-canvas'),
  count:     $('tutorial-count'),
  minus:     $('tutorial-minus'),
  plus:      $('tutorial-plus'),
  math:      $('tutorial-math'),
  modal:     $('tutorial-modal'),
  demoBtn:   $('tutorial-demo'),
  hint:      document.querySelector('.tutorial-hint'),
  wrap:      document.querySelector('.tutorial-canvas-wrap'),
};
const tCanvas = tDom.canvas;
const tCtx    = tCanvas.getContext('2d');

function tutorialSize() {
  // Fit the canvas inside the modal card width (with breathing room).
  if (!tDom.wrap || !tDom.wrap.clientWidth) return;
  const avail = Math.min(tDom.wrap.clientWidth, 340);
  const cell  = Math.max(16, Math.floor(avail / T_GRID));
  const px    = cell * T_GRID;
  tutorial.cellPx = cell;
  tutorial.pxSize = px;
  tCanvas.width  = px * DPR;
  tCanvas.height = px * DPR;
  tCanvas.style.width  = px + 'px';
  tCanvas.style.height = px + 'px';
  tCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
}

function tutorialCentroid() {
  const n = tutorial.dots.length;
  let sx = 0, sy = 0;
  for (const d of tutorial.dots) { sx += d.x; sy += d.y; }
  return { rawX: sx / n, rawY: sy / n, ix: Math.round(sx / n), iy: Math.round(sy / n), sx, sy, n };
}

function tutorialDraw() {
  const px = tutorial.pxSize, c = tutorial.cellPx;
  const cnt = tutorialCentroid();

  tCtx.fillStyle = COLORS.bg;
  tCtx.fillRect(0, 0, px, px);

  // Grid
  tCtx.strokeStyle = COLORS.grid;
  tCtx.lineWidth = 1;
  tCtx.beginPath();
  for (let i = 0; i <= T_GRID; i++) {
    tCtx.moveTo(i * c + 0.5, 0);
    tCtx.lineTo(i * c + 0.5, px);
    tCtx.moveTo(0,           i * c + 0.5);
    tCtx.lineTo(px,          i * c + 0.5);
  }
  tCtx.stroke();

  // Vector lines from each dot to the centroid (green, like in-game).
  tCtx.strokeStyle = COLORS.vector;
  tCtx.lineWidth = 1.5;
  for (const d of tutorial.dots) {
    tCtx.beginPath();
    tCtx.moveTo(d.x * c + c / 2, d.y * c + c / 2);
    tCtx.lineTo(cnt.ix * c + c / 2, cnt.iy * c + c / 2);
    tCtx.stroke();
  }

  // Dots — selected dot in orange, others blue.
  for (let i = 0; i < tutorial.dots.length; i++) {
    const d = tutorial.dots[i];
    tCtx.fillStyle = (i === tutorial.selectedIdx) ? COLORS.guess : COLORS.dot;
    tCtx.fillRect(d.x * c + 2, d.y * c + 2, c - 4, c - 4);
  }

  // Centroid (green).
  tCtx.fillStyle = COLORS.optimal;
  tCtx.fillRect(cnt.ix * c + 2, cnt.iy * c + 2, c - 4, c - 4);
}

function tutorialMathHTML() {
  const cnt = tutorialCentroid();
  const xMean = (cnt.sx / cnt.n).toFixed(2);
  const yMean = (cnt.sy / cnt.n).toFixed(2);
  // Demo uses float positions; the full breakdown is too noisy. Fall back
  // to a compact readout while playing.
  if (demoState.playing) {
    return `<span class="hl-cyan">(x̄, ȳ)</span> ≈ (${xMean}, ${yMean})`;
  }
  const xs = tutorial.dots.map(d => d.x).join(' + ');
  const ys = tutorial.dots.map(d => d.y).join(' + ');
  return (
    `<span class="hl-cyan">x̄</span> = (${xs}) / ${cnt.n} = ${cnt.sx} / ${cnt.n} = ${xMean}\n` +
    `<span class="hl-cyan">ȳ</span> = (${ys}) / ${cnt.n} = ${cnt.sy} / ${cnt.n} = ${yMean}`
  );
}

function tutorialUpdate() {
  tDom.count.textContent = String(tutorial.dots.length);
  tDom.minus.disabled = tutorial.dots.length <= T_MIN_DOTS;
  tDom.plus.disabled  = tutorial.dots.length >= T_MAX_DOTS;
  tDom.math.innerHTML = tutorialMathHTML();
  tutorialDraw();
}

function tutorialCellAt(e) {
  const rect = tCanvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left) / tutorial.cellPx);
  const y = Math.floor((e.clientY - rect.top)  / tutorial.cellPx);
  if (x < 0 || y < 0 || x >= T_GRID || y >= T_GRID) return null;
  return { x, y };
}

function findDotAt(cell) {
  if (!cell) return -1;
  for (let i = 0; i < tutorial.dots.length; i++) {
    if (tutorial.dots[i].x === cell.x && tutorial.dots[i].y === cell.y) return i;
  }
  return -1;
}

function tutorialSelect(idx) {
  tutorial.selectedIdx = idx;
  tCanvas.classList.toggle('is-grabbing', idx >= 0);
  tutorialDraw();
}

tCanvas.addEventListener('pointerdown', (e) => {
  if (demoState.playing) return;     // drag is locked while the demo runs
  const cell = tutorialCellAt(e);
  const idx  = findDotAt(cell);
  if (idx < 0) return;
  e.preventDefault();
  tCanvas.setPointerCapture?.(e.pointerId);
  // Direct drag for both mouse and touch — `touch-action: none` on the
  // canvas keeps the page from scrolling, so we don't need a long-press
  // gate to disambiguate intent.
  tutorialSelect(idx);
});
tCanvas.addEventListener('pointermove', (e) => {
  if (tutorial.selectedIdx < 0) return;
  const cell = tutorialCellAt(e);
  if (!cell) return;
  const dot = tutorial.dots[tutorial.selectedIdx];
  // Don't overlap another dot.
  if (findDotAt(cell) >= 0 && (cell.x !== dot.x || cell.y !== dot.y)) return;
  if (dot.x !== cell.x || dot.y !== cell.y) {
    dot.x = cell.x; dot.y = cell.y;
    tutorialUpdate();
  }
});
function tutorialEnd() {
  if (tutorial.selectedIdx >= 0) tutorialSelect(-1);
}
tCanvas.addEventListener('pointerup',     tutorialEnd);
tCanvas.addEventListener('pointercancel', tutorialEnd);
tCanvas.addEventListener('pointerleave',  tutorialEnd);

tDom.plus.addEventListener('click', () => {
  if (tutorial.dots.length >= T_MAX_DOTS) return;
  // Place a new dot on a free cell — try a few random spots, fall back to scan.
  const used = new Set(tutorial.dots.map(d => `${d.x},${d.y}`));
  let placed = null;
  for (let i = 0; i < 60 && !placed; i++) {
    const x = Math.floor(Math.random() * T_GRID);
    const y = Math.floor(Math.random() * T_GRID);
    if (!used.has(`${x},${y}`)) placed = { x, y };
  }
  if (!placed) {
    for (let y = 0; y < T_GRID && !placed; y++) {
      for (let x = 0; x < T_GRID && !placed; x++) {
        if (!used.has(`${x},${y}`)) placed = { x, y };
      }
    }
  }
  if (placed) {
    tutorial.dots.push(placed);
    tutorialUpdate();
  }
});
tDom.minus.addEventListener('click', () => {
  if (tutorial.dots.length <= T_MIN_DOTS) return;
  tutorial.dots.pop();
  if (tutorial.selectedIdx >= tutorial.dots.length) tutorial.selectedIdx = -1;
  tutorialUpdate();
});

$('btn-tutorial').addEventListener('click', () => {
  tDom.modal.hidden = false;
  // Size after layout — modal needs to be visible for clientWidth to be real.
  requestAnimationFrame(() => { tutorialSize(); tutorialUpdate(); });
});
tDom.modal.addEventListener('click', (e) => {
  if (e.target instanceof HTMLElement && e.target.dataset.close !== undefined) {
    tDom.modal.hidden = true;
    tutorialSelect(-1);
    if (demoState.playing) demoStop();    // closing while demo plays kills it
  }
});

// ── Tutorial demo (pre-recorded scenes) ──────────────────────────────────
let tHintHTMLOriginal = null;

function demoSetCaption(text) {
  if (tHintHTMLOriginal === null) tHintHTMLOriginal = tDom.hint.innerHTML;
  tDom.hint.classList.add('is-demo');
  tDom.hint.textContent = text;
}
function demoRestoreHint() {
  tDom.hint.classList.remove('is-demo');
  if (tHintHTMLOriginal !== null) tDom.hint.innerHTML = tHintHTMLOriginal;
}
function demoSetUI(playing) {
  tDom.demoBtn.classList.toggle('is-playing', playing);
  tDom.demoBtn.textContent = playing ? '■ Stop' : '▶ Play Demo';
  tDom.plus.disabled  = playing || tutorial.dots.length >= T_MAX_DOTS;
  tDom.minus.disabled = playing || tutorial.dots.length <= T_MIN_DOTS;
}
function demoLoadScene(idx, now) {
  const scene = DEMO_SCENES[idx];
  tutorial.dots = scene.from.map(d => ({ ...d }));
  demoState.sceneIdx = idx;
  demoState.sceneStart = now;
  demoSetCaption(scene.caption);
}
function demoTick() {
  if (!demoState.playing) return;
  const now = performance.now();
  const scene = DEMO_SCENES[demoState.sceneIdx];
  const t = Math.min(1, (now - demoState.sceneStart) / scene.duration);
  const e = easeInOut(t);
  for (let i = 0; i < scene.from.length; i++) {
    const a = scene.from[i], b = scene.to[i];
    tutorial.dots[i].x = a.x + (b.x - a.x) * e;
    tutorial.dots[i].y = a.y + (b.y - a.y) * e;
  }
  tutorialUpdate();
  if (t >= 1) {
    const next = demoState.sceneIdx + 1;
    if (next >= DEMO_SCENES.length) { demoStop(); return; }
    demoLoadScene(next, now);
  }
  demoState.raf = requestAnimationFrame(demoTick);
}
function demoStart() {
  if (demoState.playing) return;
  demoState.playing = true;
  tutorial.selectedIdx = -1;
  demoLoadScene(0, performance.now());
  demoSetUI(true);
  tutorialUpdate();
  demoState.raf = requestAnimationFrame(demoTick);
}
function demoStop() {
  if (!demoState.playing) return;
  demoState.playing = false;
  cancelAnimationFrame(demoState.raf);
  // Snap back to the default 5-dot starting position.
  tutorial.dots = TUTORIAL_DEFAULT_DOTS.map(d => ({ ...d }));
  tutorial.selectedIdx = -1;
  demoSetUI(false);
  demoRestoreHint();
  tutorialUpdate();
}
tDom.demoBtn.addEventListener('click', () => {
  if (demoState.playing) demoStop();
  else                   demoStart();
});
