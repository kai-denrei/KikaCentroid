// KikaCentroid — game logic + PWA glue.
// Module script: deferred, strict mode.

// ── Constants ────────────────────────────────────────────────────────────
const GRID       = 17;
const CELL_MIN   = 18;          // minimum tap size in CSS px
const BOARD_MAX  = 360;         // max board edge in CSS px
const MAX_ROUNDS = 10;
const PENALTY_AT = 3;           // seconds before per-second penalty kicks in
const DPR        = Math.min(window.devicePixelRatio || 1, 2);

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

const diffFor = (round) => {
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
  scoreRow:      $('score-row'),
  idleScreen:    $('idle-screen'),
  hudRound:      $('hud-round'),
  hudR:          $('hud-r'),
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
};

const ctx = dom.canvas.getContext('2d');

// ── Canvas sizing ────────────────────────────────────────────────────────
function sizeBoard() {
  const wrap = dom.canvasWrap.parentElement;
  const wrapW = wrap.clientWidth || window.innerWidth;
  const padX = 8;
  const target = Math.min(BOARD_MAX, wrapW - padX);
  cellPx = Math.max(CELL_MIN, Math.floor(target / GRID));
  boardPx = cellPx * GRID;

  dom.canvas.width        = boardPx * DPR;
  dom.canvas.height       = boardPx * DPR;
  dom.canvas.style.width  = boardPx + 'px';
  dom.canvas.style.height = boardPx + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  draw();
}

const ro = new ResizeObserver(() => sizeBoard());
ro.observe(document.body);

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

  updateUI(); draw();
}

function validate() {
  if (!S.guess || !S.optimal || S.showResult) return;
  stopTimer();

  const dist    = chebyshev(S.guess, S.optimal);
  const score   = dist + S.penalty;
  const perfect = dist === 0;

  S.showResult  = true;
  S.phase       = 'downtime';
  S.totalScore += score;
  S.history.push({ round: S.round, score, timer: S.timer, perfect });

  dom.ptsFlash.textContent = score === 0 ? '✨ 0 ✨' : `+${score}`;
  dom.ptsFlash.hidden = false;

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

function hardReset() {
  clearScheduled();
  stopTimer();
  S = mkState();
}

function begin() {
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
const MSGS = {
  hi:  ["Nice try, but you've got more in you!", "Not bad — now show your best!", "Solid effort, keep pushing!"],
  mid: ['Amazing! Your spatial reasoning is top-notch!', 'Outstanding performance!', 'Fantastic — you aced it!'],
  lo9: ['Single digit! Impressive!', 'So close to perfection!', 'Excellent intuition.'],
  lo7: ['Unreal! You beat the creator!', 'Legendary performance!', 'Phenomenal accuracy!'],
};
const recapMsg = (score) => {
  const pool = score > 25 ? MSGS.hi : score >= 10 ? MSGS.mid : score >= 8 ? MSGS.lo9 : MSGS.lo7;
  return pool[Math.floor(Math.random() * pool.length)];
};

function showRecap() {
  S.phase = 'recap';
  const h = S.history;
  const total = S.totalScore;
  const avg   = h.length ? (h.reduce((s, r) => s + r.score, 0) / h.length).toFixed(1) : '0.0';
  const avgT  = h.length ? (h.reduce((s, r) => s + r.timer, 0) / h.length).toFixed(1) : '0.0';
  const perf  = h.filter(r => r.perfect).length;

  dom.recapMsg.textContent     = recapMsg(total);
  dom.recapTotal.textContent   = `${total} points`;
  dom.recapPerfect.textContent = String(perf);
  dom.recapAvg.textContent     = avg;
  dom.recapTime.textContent    = avgT;

  dom.recapRounds.innerHTML = h.map(r => `
    <div class="recap-row">
      <span>Round ${r.round}</span>
      <span class="${r.perfect ? 'perfect' : ''}">${r.score} pts${r.perfect ? ' ✨' : ''}</span>
    </div>
  `).join('');

  const buckets   = Array.from({ length: 10 }, (_, i) =>
    h.filter(r => i < 9 ? r.score === i : r.score >= 9).length);
  const maxBucket = Math.max(...buckets, 1);
  dom.recapHist.innerHTML = '';
  buckets.forEach((count, i) => {
    const col = document.createElement('div');
    col.className = 'hist-col';
    const bar = document.createElement('div');
    bar.className = 'hist-bar';
    bar.style.height = `${Math.round(count / maxBucket * 50)}px`;
    const lbl = document.createElement('span');
    lbl.className = 'hist-lbl';
    lbl.textContent = i === 9 ? '9+' : String(i);
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
  dom.scoreRow.hidden      = false;
  dom.hudRound.hidden      = false;
  dom.hudDiff.hidden       = false;
  dom.hudTimerWrap.hidden  = false;
  sizeBoard();
}
function hideBoard() {
  dom.idleScreen.hidden    = false;
  dom.canvasWrap.hidden    = true;
  dom.scoreRow.hidden      = true;
  dom.hudRound.hidden      = true;
  dom.hudDiff.hidden       = true;
  dom.hudTimerWrap.hidden  = true;
}

function updateUI() {
  const p = S.phase;

  if (p === 'playing' || p === 'downtime' || p === 'countdown') {
    const r = Math.max(S.round, 1);
    dom.hudR.textContent = String(Math.min(S.round, MAX_ROUNDS));
    const diff = diffFor(r);
    dom.hudDiff.textContent = diff.name;
    dom.hudDiff.style.color = diff.color;

    const secs = S.timer;
    dom.hudTimer.textContent = `0:${String(secs).padStart(2, '0')}`;
    dom.hudTimer.style.color = secs <= PENALTY_AT ? COLORS.optimal : COLORS.guessHit;

    if (S.penalty > 0) {
      dom.hudPenalty.hidden = false;
      dom.hudPenalty.textContent = ` +${S.penalty}`;
    } else {
      dom.hudPenalty.hidden = true;
    }
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

if (isIOS && isSafari && !isStandalone && !localStorage.getItem('kc-ios-hint-dismissed')) {
  setTimeout(() => { dom.iosHint.hidden = false; }, 2500);
}
dom.iosHintClose.addEventListener('click', () => {
  dom.iosHint.hidden = true;
  localStorage.setItem('kc-ios-hint-dismissed', '1');
});

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
