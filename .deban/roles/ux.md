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

- **Refined animation polish, six effects** (2026-04-30) — round-flow choreography (dot stagger fade-in, tap ripple, validate-line draw + centroid fade, distance-flash float-up at guess cell) + microinteractions (modal fade-in, button :active scale). All 80–600ms, no bounce. Spotless commit gets a gold ring overlay variant of the tap ripple. Refined register chosen over arcade-dramatic (no particle bursts, no screen shake) and casual-playful (no spring physics). [[dev]]

- **Achievements: locked names visible, descriptions hidden** (2026-04-30) — locked rows in the dedicated Achievements modal show only the tier name + LOCKED status; description is revealed on unlock. Pre-unlock the user can see what's coming (motivates aspiration) but the unlock condition stays a surprise. Unlocked rows show name + description + "Unlocked YYYY-MM-DD · seed".

- **Daburu / Toripuru / Sextuple romaji renames** (2026-04-30 / 05-01) — tier 2 Duo→Daburu, tier 3 Triple→Toripuru match the existing Japanese geek register of higher tiers (四連続, ペンタキル). Tier 6 Sex-tuple→Sextuple drops the hyphen. HYPE_TIERS is the single source of truth — both streak callout and achievement pill update from one edit.

- **Mode picker as radial menu, replacing [HARD] toggle** (2026-05-01) — `[MODE]` toolbar button opens a modal with three buttons in an equilateral triangle (Normal top, Tetro bottom-left, Long Shot bottom-right). Locked modes dim and reject clicks; active mode highlighted cyan. Tetro and Long Shot tinted per-mode. Alternative considered: vertical list. Rejected — the radial layout makes "modes are siblings" visually obvious instead of "ordered list." [[pm]]

- **Perfect flash: white text + white border + cyan ambient glow, 12×24 padding, 1200ms with hold phase, anchored 1 cell above guess** (2026-05-01) — converged after several iterations from the original `✨ +10 ✨` text with green text-shadow. Final treatment is a smaller localized cousin of the full-screen `.perfect-overlay` (white/cyan palette, boxed with 10px radius). Hold-phase animation (appear → dwell → float) replaces the original quick rise. [[dev]]

- **No emoji policy** (2026-05-01) — removed ⏱ from timer and 🔓 from unlock banner. Functional state glyphs in sparkline (◆ fresh seed / ↻ replay) kept. Geometric Unicode shapes (▶ play, ★ achievements, × close, ■ stop) flagged as candidates but left for now.

## Dead Ends

- **Two-step place + validate flow with optional `[1-SHOT]` toolbar toggle** (2026-04-30) — added the `[1-SHOT]` mode as opt-in alongside the existing place→validate. After playtesting, the toggle button crowded the toolbar on small screens (got hidden / pushed off), and the dual How-to-Play swap added cognitive load. Decision: kill the legacy flow entirely, make single-tap-commit the only flow, drop the toggle.

- **Streak callout positioned above canvas top** (2026-04-30) — first attempt anchored the callout above the play area at the top of the canvas frame. On some viewports the canvas was small enough that the callout appeared visually below or beside the play area, not above. Replaced with anchoring 2 cells above the user's last guess — lands where the eye already is.

- **Hardcoded "aka-sop-921" placeholder in seed input** (2026-04-30) — stayed visible between runs, made the user think Play Again was reverting to a fixed seed. Replaced with `generateRandomSeed()` called on bootstrap, Play Again, and Clear.

- **Tier-by-tier increasing streak durations (700→1400ms)** (2026-04-30) — Sextuple/Heptapod felt briefer than Duo despite longer total durations. The scale-up entrance ate more of the budget at high tiers. Unified all tiers to 2000ms (2800ms for tier 10).

- **Long-press to grab a dot in the tutorial** (2026-04-30) — bad UX on touch: tap-and-drag motion < 350ms cancels selection. Users instinctively drag, get nothing. Replaced with direct drag for both mouse and touch. [[dev]]

- **Recap modal backdrop-tap closed the modal, stranding the user** (2026-04-30) — backdrop tap dismissed recap, but the underlying state was `S.phase === 'recap'` with the dead-round canvas behind it. Action button disabled, only RESET worked. User had to tap RESET twice to escape. Fixed in v1.48 by removing the recap-modal click handler entirely; the modal now requires explicit Play Again / View Achievements / Share to exit.

- **v1.39 idle compaction stripped the centroid footnote and START GAME formula sub-line that weren't asked for** (2026-04-30) — interpreted "compact" too broadly. User pushback: "this round eliminated more than I asked." Restored both in v1.40. Saved a feedback rule in user auto-memory: when items are enumerated, treat the list as exhaustive; if a constraint can't be met without further pruning, ask first.

- **Indigo Perfect-flash palette (matched .s-100 100-score color)** (2026-04-30 → 05-01) — initial design used `#5b6cff` indigo for the boxed Perfect flash, mirroring the score-tier gradient's 100-score color. User preferred the full-screen perfect-overlay's white-on-cyan palette ("white, with a white/blue frame, no purple"). Switched to white text + white border + cyan ambient glow in v1.57.

## Open Questions

- Trailing `!` after Japanese kanji labels (`四連続!`, `ペンタキル!`) feels left-of-center. Options: switch to full-width `！`, drop the `!`, leave it. Open.
- Should the "+ Challenge seed" panel surface the auto-generated seed for the next run as a preview, or stay neutral (current)? Currently neutral — only shown after recap.

## Assumptions

- Users will scroll the idle card if its content overflows; we don't summarize or hide content past the fold. The footnote, the `+ Challenge seed`, and the tutorial button all sit below the legend on small phones.
- "Race the clock · trust your gut" reads as a single positive instruction, not as two competing demands. Untested with non-English speakers.

## Lessons

- Anchor visual feedback to where the user's attention already is, not where it logically belongs. Streak label moved from canvas-top to "above the last guess" was the same call. — from dead end on 2026-04-30
- A toggle that's "always on for power users" is just a flow you should commit to. Removing the One-Shot toggle simplified three places at once: toolbar, How-to-Play, hint text. — from dead end on 2026-04-30
- Modals that have no useful underlying state must require explicit action to dismiss; backdrop-close only works if closing reveals something the user can do. — from dead end on 2026-04-30
- When the user enumerates items to remove or change, treat the list as exhaustive. If a constraint (e.g. fit-on-one-screen) can't be met within those edits, ask before pruning further. — from dead end on 2026-04-30
- Match the localized "celebration" element's palette to the most-celebrated event of the same kind; the tier-10 PERFECT! overlay is the canonical reference, so per-round Perfect-flash should mirror it (white-on-cyan), not invent a parallel palette. — from dead end on 2026-05-01

## Session Log

2026-05-01 — v1.39→v1.58 UX wave: idle compaction (with one over-extrapolation course-corrected), achievements modal + recap pill row, Daburu/Toripuru/Sextuple renames, mode picker radial menu replacing HARD toggle, refined animation polish (six effects), Perfect flash converged across multiple iterations to white/cyan boxed treatment with hold-phase animation. Dead ends: recap stuck-state, over-deletion, indigo Perfect palette.

2026-04-30 — Shipped hype callouts (9 tiers + perfect-run overlay), score-tier gradient (orange→green→cyan→blue→indigo), tutorial + Play Demo, run-detail modal, simplified to one-tap commit, dropped `[1-SHOT]` toggle. Dead ends recorded for two-step flow, callout positioning, fixed placeholder, tiered durations, long-press.
