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

## Dead Ends

- **Three-category score model: random / foreign / replay** (2026-04-30) — spent design cycles on a clean separation. After implementation, "random" (no seed) added complexity without value: the user couldn't share their good runs, and it confused the recap when half the records had no seed info. Collapsed to "every run is seeded by default; foreign is when seed came from URL/typed; replay when attempt > 1." Two distinctions instead of three. [[dev]]

## Open Questions

- After merge & mobile verification, should we promote KikaCentroid as a shareable game (Twitter/Mastodon/Telegram) or keep it as a private toy? Affects whether we add export/import, leaderboards, etc.
- Long-shot bias: should it scale up under HARD mode (2 long-shot rounds instead of 1)? Currently always 1 regardless of mode.

## Assumptions

- Solo playtesting on Mac + iPhone is sufficient signal for shipping. No A/B testing, no analytics, no retention tracking. Acceptable for the project's scale.
- The 8-idea backlog from the original brainstorm represents the v1 feature set. v2 starts after #8 ships and is verified.

## Lessons

- Categories that exist "for symmetry" but don't survive contact with implementation are usually wrong. The "no seed" category felt right on paper, fell apart in the recap. — from dead end on 2026-04-30

## Session Log

2026-04-30 — Backlog progression: ☑ #1 Hype, ☑ #2 One-Shot (then unified into the only flow), ☑ #3 Long-shot, ☑ #4 Seeds (auto-seed-everywhere), ☑ #5 Color gradient, ☑ #6 (via #4), ☑ #7 Tutorial + Play Demo, ☐ #8 Achievements. Dead end on three-category seed model.
