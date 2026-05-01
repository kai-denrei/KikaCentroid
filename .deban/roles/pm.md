---
name: pm
description: Scope and feature decisions for KikaCentroid — backlog, sequencing, what ships
type: role
owner: Gerald
status: active
---

## Decisions

- **Wave-based shipping over feature-by-feature** (2026-04-30) — original brainstorm produced 8 ideas, grouped into Juice / Speed / Social waves. Shipped Speed (#2 One-Shot, #3 Long-shot) and Juice (#1 Hype, #5 Color gradient) and Social (#4 Seeds, #7 Tutorial) on the same branch. Single PR has been the pattern; not splitting per item. [[dev]] [[ux]]

- **#6 user-created challenges considered shipped via #4 seeds** (2026-04-30) — anyone can share a challenge link via Copy Challenge Link in the recap or the run-detail modal. No separate "challenge curation" surface needed.

- **Skip JSON export/import for now** (2026-04-30) — localStorage durability is "casual": survives reload/restart, dies on explicit data wipes. Acceptable for casual play. Defer export until shared use surfaces a need. [[arch]]

- **Achievements (#8) is the last item before merge** (2026-04-30) — sequence: ship #8 last, push branch, mobile verify on real iPhone, then merge to main.

- **Achievement set: 9 streak tiers + 4 skill achievements** (2026-04-30 → 05-01) — streak ladder reuses the X-in-a-row callout names (Daburu, Toripuru, 四連続, ペンタキル, Sextuple, Heptapod, Octopus, Penultimate, PERFECT!). Skill achievements added separately: **Long Shot** (spotless on centroid 3+ cells from any dot), **Marksman** (run total ≥90), **Sharpshooter** (run total ≥95), **Speed Demon** (avg time ≤1.0s with score ≥90). Centroid-distance metric for Long Shot was chosen over "tagged round only" so the achievement applies to any round that meets the geometry, not just the surprise round our long-shot generator produces. Speed Demon at 1.0s matches the original "1s 90+" brainstorm spec — rare but earnable. [[dev]] [[ux]]

- **Tetro promoted from hidden URL to first-class mode** (2026-05-01) — initially shipped as a hidden mode at `/tetro` redirecting to `?mode=tetro`. User feedback after real-device play: "surprisingly fun." Promoted to a peer of Normal in the new mode picker. Unlock condition: spotless on the dedicated tetro round in Normal mode (1 random round per run renders a 2-tetromino layout, no telegraph).

- **3-mode system (Normal / Tetro / Long Shot), HARD as concept retired** (2026-05-01) — `[HARD]` toolbar button replaced by `[MODE]` opening a radial menu. HARD's skewed-distribution generators rebranded as Long Shot mode (every round uses the cluster-outlier / bi-cluster / corner-heavy patterns). Modes are mutually exclusive. HARD-unlocked users auto-migrate to Long-Shot-unlocked. Long Shot mode unlock vector tied to the Long Shot achievement (centroid 3+ cells from any dot). Alternative considered: keep HARD as a separate orthogonal toggle that applies within each mode. Rejected — adds 6 effective combinations (3 modes × HARD on/off) when only 3 are conceptually distinct. [[dev]] [[ux]] [[arch]]

## Dead Ends

- **Three-category score model: random / foreign / replay** (2026-04-30) — spent design cycles on a clean separation. After implementation, "random" (no seed) added complexity without value: the user couldn't share their good runs, and it confused the recap when half the records had no seed info. Collapsed to "every run is seeded by default; foreign is when seed came from URL/typed; replay when attempt > 1." Two distinctions instead of three. [[dev]]

- **HARD mode as a separate orthogonal toggle** (2026-05-01) — coexisted alongside the modes (`hardMode` could be on or off in any mode). After real-device play exposed the new mode picker, HARD's value collapsed: its skewed-distribution generators became indistinguishable in spirit from "Long Shot mode" the user wanted as a peer of Tetro. Rolled HARD's mechanics into Long Shot mode, retired HARD as a top-level concept. The 91-score milestone unlock no longer points anywhere; auto-migrates existing users to Long Shot for backward-compat.

## Open Questions

- After merge & mobile verification, should we promote KikaCentroid as a shareable game (Twitter/Mastodon/Telegram) or keep it as a private toy? Affects whether we add export/import, leaderboards, etc.
- Long-shot bias: should it scale up under HARD mode (2 long-shot rounds instead of 1)? Currently always 1 regardless of mode.

## Assumptions

- Solo playtesting on Mac + iPhone is sufficient signal for shipping. No A/B testing, no analytics, no retention tracking. Acceptable for the project's scale.
- The 8-idea backlog from the original brainstorm represents the v1 feature set. v2 starts after #8 ships and is verified.

## Lessons

- Categories that exist "for symmetry" but don't survive contact with implementation are usually wrong. The "no seed" category felt right on paper, fell apart in the recap. — from dead end on 2026-04-30
- A "hidden mode" that gets real-device play and turns out fun is the strongest signal that it deserves first-class status. Tetro's hidden-URL phase produced honest feedback ("surprisingly fun") that motivated the mode picker redesign. — from dead end on 2026-05-01
- Auxiliary toggles ("HARD on/off") tend to collapse once their content becomes a distinct mode. Per-mode mechanics > orthogonal modifiers when the modifier wasn't really orthogonal. — from dead end on 2026-05-01

## Session Log

2026-05-01 — Backlog: ☑ all 8 original ideas, ☑ #8 Achievements (streak ladder + 4 skill achievements with explicit thresholds), ☑ Tetro promoted to first-class mode, ☑ 3-mode picker shipped (Normal / Tetro / Long Shot), HARD retired as a concept. v1 feature-complete + several v1.x iterations of polish.

2026-04-30 — Backlog progression: ☑ #1 Hype, ☑ #2 One-Shot (then unified into the only flow), ☑ #3 Long-shot, ☑ #4 Seeds (auto-seed-everywhere), ☑ #5 Color gradient, ☑ #6 (via #4), ☑ #7 Tutorial + Play Demo, ☐ #8 Achievements. Dead end on three-category seed model.
