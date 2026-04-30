---
name: ux
description: Interaction and visual decisions for KikaCentroid — flow, copy, callouts, timing, color
type: role
owner: Gerald
status: active
---

## Decisions

- **Hype callouts on consecutive spotless rounds, tier ≥ 2** (2026-04-30) — Duo / Triple / 四連続 / ペンタキル / Sex-tuple / Heptapod / Octopus / Penultimate / PERFECT! Stacked above the existing `+10` flash, anchored 2 cells above the user's last guess (where the eye already is, not at canvas top). 2000ms duration for tiers 2-9, 2800ms for tier 10 (the run-ender). Tier 10 also fires a full-screen overlay and swaps recap title to "PERFECT RUN". [[dev]]

- **Score gradient: orange in 80s → green/cyan/blue ramp 90→100, indigo glow at 100** (2026-04-30) — applied to both recap total and last-10-runs sparkline. Six fine-grained buckets at 90+ (90/91, 92/93, 94/95, 96/97, 98/99, 100), with text-shadow glow that intensifies with score. Below 80: dim grey/red-soft, no glow. The 80-89 orange band signals "you're approaching the good range" without crossing into the green/cyan/blue gradient.

- **Run-detail modal stacks above recap** (2026-04-30) — clicking any sparkline record opens a small modal with Score / Mode / When; for seeded runs also Seed / Type tag / Copy Challenge Link / Use this seed. z-index 110 vs recap's 100. Closes on backdrop or × tap.

- **Tutorial as opt-in via "▶ Watch Tutorial?" button** (2026-04-30) — placed below the centroid footnote on the idle screen, dashed-grey by default, cyan on hover. Modal opens with 13×13 mini canvas, 5 starting dots in asymmetric pattern, real-time math readout showing `x̄ = (Σ) / n = result`. Drag (mouse or touch) to move dots; centroid follows.

- **Play Demo: 4 pre-recorded scenes** (2026-04-30) — Convergence → Outlier → Symmetric → Drift. ~14.5s total, eased animation, scene caption swaps the hint line italic. Auto-stops on completion. Demo button toggles to red `■ Stop`.

- **Streak label: text-align center + no letter-spacing** (2026-04-30) — earlier `letter-spacing: 0.04em` added trailing whitespace inside the element box, biasing visible glyphs left of geometric center on long labels. Removed the letter-spacing; trade-off accepted for the trailing `!` after kanji where optical center can still feel slightly off.

- **`+ Challenge seed` panel on idle screen, between legend and footnote** (2026-04-30) — collapsed `<details>` element. Placeholder rotates each visit (random sample seed) so it can't read as hardcoded. Auto-expands when a seed is staged. Used for advanced flows: enter foreign seed, preview self-generated seed, replay from sparkline.

- **Versioning: v1.NN format** (2026-04-30) — switched from `vNN` to `v1.NN` to mark these as minor revisions of v1. Cache version uses the same string.

## Dead Ends

- **Two-step place + validate flow with optional `[1-SHOT]` toolbar toggle** (2026-04-30) — added the `[1-SHOT]` mode as opt-in alongside the existing place→validate. After playtesting, the toggle button crowded the toolbar on small screens (got hidden / pushed off), and the dual How-to-Play swap added cognitive load. Decision: kill the legacy flow entirely, make single-tap-commit the only flow, drop the toggle.

- **Streak callout positioned above canvas top** (2026-04-30) — first attempt anchored the callout above the play area at the top of the canvas frame. On some viewports the canvas was small enough that the callout appeared visually below or beside the play area, not above. Replaced with anchoring 2 cells above the user's last guess — lands where the eye already is.

- **Hardcoded "aka-sop-921" placeholder in seed input** (2026-04-30) — stayed visible between runs, made the user think Play Again was reverting to a fixed seed. Replaced with `generateRandomSeed()` called on bootstrap, Play Again, and Clear.

- **Tier-by-tier increasing streak durations (700→1400ms)** (2026-04-30) — Sextuple/Heptapod felt briefer than Duo despite longer total durations. The scale-up entrance ate more of the budget at high tiers. Unified all tiers to 2000ms (2800ms for tier 10).

- **Long-press to grab a dot in the tutorial** (2026-04-30) — bad UX on touch: tap-and-drag motion < 350ms cancels selection. Users instinctively drag, get nothing. Replaced with direct drag for both mouse and touch. [[dev]]

## Open Questions

- Trailing `!` after Japanese kanji labels (`四連続!`, `ペンタキル!`) feels left-of-center. Options: switch to full-width `！`, drop the `!`, leave it. Open.
- Should the "+ Challenge seed" panel surface the auto-generated seed for the next run as a preview, or stay neutral (current)? Currently neutral — only shown after recap.

## Assumptions

- Users will scroll the idle card if its content overflows; we don't summarize or hide content past the fold. The footnote, the `+ Challenge seed`, and the tutorial button all sit below the legend on small phones.
- "Race the clock · trust your gut" reads as a single positive instruction, not as two competing demands. Untested with non-English speakers.

## Lessons

- Anchor visual feedback to where the user's attention already is, not where it logically belongs. Streak label moved from canvas-top to "above the last guess" was the same call. — from dead end on 2026-04-30
- A toggle that's "always on for power users" is just a flow you should commit to. Removing the One-Shot toggle simplified three places at once: toolbar, How-to-Play, hint text. — from dead end on 2026-04-30

## Session Log

2026-04-30 — Shipped hype callouts (9 tiers + perfect-run overlay), score-tier gradient (orange→green→cyan→blue→indigo), tutorial + Play Demo, run-detail modal, simplified to one-tap commit, dropped `[1-SHOT]` toggle. Dead ends recorded for two-step flow, callout positioning, fixed placeholder, tiered durations, long-press.
