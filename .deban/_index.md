---
project: KikaCentroid
mode: solo
stale_threshold_days: 30
created: 2026-04-30
---

# KikaCentroid

Installable PWA grid puzzle: estimate the centroid of a dot cluster, 10 rounds per run, lowest distance + speed wins. Single-tap commit, three-mode picker (Normal / Tetro / Long Shot) with per-mode unlock paths, shareable seeds (every run is auto-seeded), 13-tier achievement set (9 streak + 4 skill). Hosted on GitHub Pages from `main`; service-worker-driven offline support with versioned-query-string cache busting.

## Active Roles

- [[dev]] — engineering decisions: PRNG, state, render, persistence
- [[ux]] — interaction & visual decisions: callouts, timing, gradients, layout
- [[pm]] — scope & feature decisions: what ships, what defers
- [[arch]] — data model, persistence tier, cache strategy

## Cross-Role Decisions

- **Single-tap-commit is the only flow** (2026-04-30) — removed the place→validate two-step. No mode toggle. [[dev]] [[ux]] [[pm]]
- **Every run is seeded by default** (2026-04-30) — auto-generated `xxx-yyy-NNN` seed at `begin()`, treated as `self` origin. The `+` panel is now opt-in advanced (foreign seed, preview self seed, replay). [[dev]] [[pm]]
- **localStorage-only persistence, casual durability** (2026-04-30) — no cloud, no auth. JSON export deferred until shared use surfaces a need. [[arch]]
- **3-mode system (Normal / Tetro / Long Shot)** (2026-05-01) — `[MODE]` toolbar button replaces `[HARD]`. HARD as a concept retired; its skewed-distribution generators rebranded inside Long Shot mode. Per-mode unlock paths: Tetro via spotless on the dedicated tetro round in Normal mode; Long Shot via the centroid-3+-cells achievement. Existing HARD-unlocked users auto-migrated. [[dev]] [[ux]] [[pm]] [[arch]]
- **Versioned query strings on CSS/JS** (2026-05-01) — RESOLVED the SW cache rollover gotcha that bit production twice. `styles.css?v=1.NN` URLs guarantee a stale SW cache miss → network fetch → fresh asset, regardless of SW activation state. [[dev]] [[arch]]
- **Achievements set: 9 streak tiers + 4 skill** (2026-04-30 → 05-01) — streak ladder reuses callout names; skill achievements are Long Shot / Marksman (≥90) / Sharpshooter (≥95) / Speed Demon (avg ≤1s + ≥90). Total 13. Stable string keys in `kc-achievements`. [[pm]] [[ux]]

## Cross-Role Open Questions

- Should `kc-history` grow beyond 10 entries to support cross-run statistics or future leaderboards? Currently capped for the sparkline. [[arch]]
- Should the achievements modal also be reachable in-game (during play) or only from idle/recap? Currently only from idle (★ button) and recap (View Achievements button). [[ux]]
- Promote KikaCentroid publicly (Twitter/Mastodon/Telegram) or stay a private toy? Affects whether export/import becomes more urgent. [[pm]]

## Pending Sub-Projects

(none active — v1 feature-complete as of v1.58. v2 candidates documented per role in `## Open Questions`.)
