---
name: dev
description: Engineering decisions for KikaCentroid — game logic, PRNG, render path, state shape, persistence
type: role
owner: Gerald
status: active
---

## Decisions

- **Mulberry32 PRNG seeded by hashed string** (2026-04-30) — gameplay routes through `rng()`, set at `begin()` from the active seed. ~6 lines of PRNG code, deterministic across browsers. UI flavor (recap message picker) intentionally stays on `Math.random()` so two playthroughs of the same seed don't get the same hype text. [[arch]]

- **Auto-seed every run in `begin()`** (2026-04-30) — when `pendingSeed` is null, generate one and treat as `self` origin. Removes "no seed" as a meaningful state without breaking the foreign/replay distinctions. Alternative considered: keep three categories (random/foreign/replay) — rejected because the unseeded branch added code paths and confused users into thinking some runs were "missing" seeds. [[pm]]

- **Single-tap commit replaces place→validate** (2026-04-30) — pointer down places guess, schedules `validate` at `COMMIT_DELAY_MS` (100ms) so the orange marker registers visually. Removes `oneShot` toggle, `kc-oneshot-on` localStorage key (auto-cleaned on load), the toolbar `[1-SHOT]` button, and the dual How-to-Play list. [[ux]]

- **Long-shot pattern guaranteed once per run** (2026-04-30) — round number picked from `rng()` at `begin()`, deterministic under a seed. Pattern: 3-4 dot cluster at edge/corner + 1-2 mirrored outliers. Overrides difficulty's dot count for that round only.

- **Tutorial uses direct-drag, no long-press** (2026-04-30) — `touch-action: none` on canvas + immediate `tutorialSelect(idx)` on `pointerdown` for both mouse and touch. setPointerCapture keeps drag alive past canvas edge. See dead end below.

- **Versioned query strings on CSS/JS for cache busting** (2026-05-01) — `styles.css?v=1.NN` and `game.js?v=1.NN` references in HTML, mirrored in `PRECACHE_URLS` via interpolated `ASSET_VER`. Each release uses a different URL, so the SW's `cache.match()` returns null on a stale SW → network fetch → fresh asset, even before the new SW activates. Replaces the previous `!important` + Refresh-toast workaround. Alternative considered: SW `skipWaiting()` on install (auto-activate). Rejected — would force-reload pages mid-session on every release. [[arch]]

- **Mode system architecture** (2026-05-01) — `activeMode` runtime variable resolved from URL param `?mode=...` (one-time bypass) → stored `kc-mode` (gated by unlock check) → fallback `'normal'`. Per-mode unlock keys (`kc-tetro-unlocked`, `kc-longshot-unlocked`). Migration: existing `kc-hard-unlocked` users auto-promoted to `kc-longshot-unlocked` at boot. Three modes mutually exclusive. RNG draws for `S.tetroRound` and `S.longShotRound` happen unconditionally at `begin()` so cross-mode determinism stays predictable. [[arch]] [[pm]]

- **Tetromino placement: two-pass with gap fallback** (2026-04-30) — first pass requires a 1-cell gap between pieces (each tetromino reads as a clear island). If 60 attempts fail, second pass relaxes to plain no-overlap. Strict no-overlap is always preserved. Alternative considered: single-pass strict no-adjacent. Rejected — denser piece counts (5+ in HARD-tier rounds) would fail too often.

- **Animation polish via single RAF loop** (2026-04-30) — `ensureAnimLoop()` runs while any active animation timestamp is in flight (`tapRipple`, `spotlessRipple`, `dotsAppearT0`, `validateAnimT0`). Auto-stops when `isAnimating(now)` returns false. All canvas effects driven by timestamps in `S`; modal fades + button presses handled via CSS transitions. No new dependencies. [[ux]]

## Dead Ends

- **Long-press required for tutorial dot drag (350ms + 8px tolerance)** (2026-04-30) — built it on first pass per the original spec. Failed in F12 iPhone view: tap-and-drag motion within 350ms cancels selection, so the natural touch gesture produced no result. Real touch would have the same problem. Replaced with direct-drag.

- **Tiered streak callout durations 700ms→1400ms** (2026-04-30) — assumption: bigger labels get longer time. Reality: high-tier scale-up animation eats more of the budget, so the *hold* phase felt shorter for Sextuple/Heptapod than for Duo. Unified all tiers to 2000ms (tier 10 to 2800ms).

- **SW StaleWhileRevalidate for CSS** (2026-04-30) — when bumping cache versions, HTML comes fresh (NetworkFirst) but CSS comes from the still-active prior SW's cache for one cycle, producing a v(N) HTML / v(N-1) CSS mismatch. Symptom: rules added in the new release "didn't work" until a second reload. Mitigated with `!important` on the most-likely-conflicting rules and clearer instruction to click the orange "Refresh" toast (which sends `skipWaiting` and activates the new SW). The architectural fix would be SW-level cache busting via query string per asset; not done yet. **RESOLVED in v1.50** — versioned query strings (`styles.css?v=1.NN`) bypass the SW cache mismatch entirely. Stale SW `cache.match()` misses the new URL, falls through to network. Recurred twice in production (achievements pills plain-white on iPhone) before the fix landed.

- **`abandonRun` raw setTimeout** (2026-05-01) — RESET-twice flow used a bare `setTimeout` for the 1200ms overlay clear, not the tracked `schedule()` helper. Surfaced by /eng-review: a backgrounded-then-resumed tab could resume the timer after a new run had begun, writing a phantom 0 score under the new run's seed. Fixed by routing through `schedule()` AND snapshotting `{seed, attempt, origin}` into a local before the timer fires — so `hardReset()`'s `clearScheduled()` cancels the pending write entirely if a new run races in.

- **Double-tap race in pointerdown commit window** (2026-05-01) — between placing the guess (`S.guess = cell`) and `validate` firing 100ms later, a second pointerdown could overwrite `S.guess`. `validate()` was idempotent via `S.showResult` so it didn't double-validate, but the recorded guess was whichever cell the user tapped second — silently breaking seeded-run determinism on a fast double-tap. Fixed by `if (S.guess) return;` at the top of the handler.

- **Manifest served via StaleWhileRevalidate** (2026-05-01) — manifest was in `PRECACHE_URLS` and matched by `req.destination === 'manifest'` in the SWR branch. Manifest changes (`short_name`, `theme_color`) couldn't reach already-installed Android Chrome PWAs since the SWR cache returned the stale precached copy. Fixed by routing manifest to a new `networkFirst` helper. iOS reads manifest only at install time, so its behavior is unchanged.

- **v1.39 over-deletion: footnote + button formula stripped during compaction** (2026-04-30) — user asked to remove specific items (banner title, subtitle, dual How-to-Play list) for mobile no-scroll. Extrapolated to also remove the centroid-definition footnote and the formula sub-line on the START GAME button — neither was named. User pushback: "this round eliminated more than I asked." Restored both in v1.40. The lesson is in the user's auto-memory as a feedback rule.

## Open Questions

- Should achievements writes happen at the same point as `pushRunHistory` (recap path), or in their own `evaluateAchievements(run)` step? Probably the latter — keeps history serialization pure.
- Tutorial: should dragging across the page edge (when scaled up by zoom) snap the dot back? Untested.

## Assumptions

- localStorage `setItem` won't throw under normal use; we wrap in try/catch but don't surface failures. Acceptable: data loss on quota exceed is silent. Quota in practice is megabytes, our payload is bytes.
- All current users open the PWA via the same origin — seed share links assume `location.origin + pathname + #s=...`. Not robust to the PWA being embedded under a different path.

## Lessons

- Touch interaction doesn't need long-press if `touch-action: none` is set on the canvas — the browser stops competing for the gesture, so direct drag is unambiguous. — from dead end on 2026-04-30
- Equal duration > tiered duration when comparing across short timescales; the user's perception of a callout's "length" is dominated by the hold phase, not total runtime. — from dead end on 2026-04-30
- PWA SW cache rollover: NetworkFirst HTML + StaleWhileRevalidate assets means a single version bump produces a transient HTML/CSS skew. Bumping `!important` on rules whose absence would be obviously wrong is a cheap insurance policy. — from dead end on 2026-04-30

- Versioned query strings on assets bypass SW cache mismatches at near-zero cost; preferable to invasive SW activation flows like auto-skipWaiting that force mid-session reloads. The required discipline (HTML and SW must stay in lockstep on the version) is the same discipline you already need for cache version bumps. — from dead end on 2026-05-01

- Any timer that writes user-visible state must route through the tracked `schedule()` helper so `hardReset()` can cancel it. Raw `setTimeout` is a hidden state-write hazard. — from dead end on 2026-05-01

- Auto-validate flows need a guard against extra input during the commit-delay window. The committed-state value is whichever happened LAST, not first — fast double-taps silently desync the visible guess from the recorded guess. — from dead end on 2026-05-01

## Session Log

2026-05-01 — v1.39→v1.58 polish + features: idle compaction, post-audit fixes (abandonRun race, double-tap race, manifest cache strategy), tutorial dom bag refactor, achievements (streak ladder + 4 skill), animation polish wave, hidden tetro mode promoted to first-class, mode picker (Normal/Tetro/Long Shot) replacing HARD toggle, versioned query strings RESOLVED the SW cache rollover gotcha. Two production audits (/eng-review and /mobile-pwa) ran and surfaced the correctness fixes. Eight PRs merged in this period.

2026-04-30 — Implemented seeding (Mulberry32 + cyrb53-lite hash, xxx-yyy-NNN format), unified to single-tap-commit, added long-shot bias, tutorial + Play Demo, run-detail modal, score-tier gradient, auto-seed-everywhere. Dead ends: long-press, tiered durations, SW cache strategy. Branch `feat/one-shot-mode` carries v20 → v1.38.
