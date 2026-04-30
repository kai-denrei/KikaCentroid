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

## Dead Ends

- **Long-press required for tutorial dot drag (350ms + 8px tolerance)** (2026-04-30) — built it on first pass per the original spec. Failed in F12 iPhone view: tap-and-drag motion within 350ms cancels selection, so the natural touch gesture produced no result. Real touch would have the same problem. Replaced with direct-drag.

- **Tiered streak callout durations 700ms→1400ms** (2026-04-30) — assumption: bigger labels get longer time. Reality: high-tier scale-up animation eats more of the budget, so the *hold* phase felt shorter for Sextuple/Heptapod than for Duo. Unified all tiers to 2000ms (tier 10 to 2800ms).

- **SW StaleWhileRevalidate for CSS** (2026-04-30) — when bumping cache versions, HTML comes fresh (NetworkFirst) but CSS comes from the still-active prior SW's cache for one cycle, producing a v(N) HTML / v(N-1) CSS mismatch. Symptom: rules added in the new release "didn't work" until a second reload. Mitigated with `!important` on the most-likely-conflicting rules and clearer instruction to click the orange "Refresh" toast (which sends `skipWaiting` and activates the new SW). The architectural fix would be SW-level cache busting via query string per asset; not done yet.

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

## Session Log

2026-04-30 — Implemented seeding (Mulberry32 + cyrb53-lite hash, xxx-yyy-NNN format), unified to single-tap-commit, added long-shot bias, tutorial + Play Demo, run-detail modal, score-tier gradient, auto-seed-everywhere. Dead ends: long-press, tiered durations, SW cache strategy. Branch `feat/one-shot-mode` carries v20 → v1.38.
