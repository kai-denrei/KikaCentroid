---
project: KikaCentroid
mode: solo
stale_threshold_days: 30
created: 2026-04-30
---

# KikaCentroid

Installable PWA grid puzzle: estimate the centroid of a dot cluster, 10 rounds per run, lowest distance + speed wins. Single-tap commit, optional Hard Mode (skewed distributions), optional shareable seeds. Hosted on GitHub Pages from `main`; service-worker-driven offline support.

## Active Roles

- [[dev]] — engineering decisions: PRNG, state, render, persistence
- [[ux]] — interaction & visual decisions: callouts, timing, gradients, layout
- [[pm]] — scope & feature decisions: what ships, what defers
- [[arch]] — data model, persistence tier, cache strategy

## Cross-Role Decisions

- **Single-tap-commit is the only flow** (2026-04-30) — removed the place→validate two-step. No mode toggle. [[dev]] [[ux]] [[pm]]
- **Every run is seeded by default** (2026-04-30) — auto-generated `xxx-yyy-NNN` seed at `begin()`, treated as `self` origin. The `+` panel is now opt-in advanced (foreign seed, preview self seed, replay). [[dev]] [[pm]]
- **localStorage-only persistence, casual durability** (2026-04-30) — no cloud, no auth. JSON export deferred until shared use surfaces a need. [[arch]]

## Cross-Role Open Questions

- Achievements storage shape — combine into one blob or per-namespace key? Decided when we start #8.
- Mobile production verification — does the iOS PWA cache rollover work cleanly across v1.38? Pending real-device test.

## Pending Sub-Projects

- **#8 Achievements** — 90 / 95 / two-in-a-row / 3× / 5× / fast-and-accurate / Long Shot. Storage + display surface in recap. Not yet started.
