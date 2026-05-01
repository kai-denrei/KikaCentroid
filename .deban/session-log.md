# Session Log

Append-only timestamped event log.

---

2026-04-30 16:00 — INIT — mode: solo, roles: dev,ux,pm,arch
2026-04-30 16:00 — SYNC — recorded large in-flight session (`feat/one-shot-mode` branch, v20 → v1.38). Decisions captured across all four roles. Dead ends recorded for long-press tutorial drag, tiered streak durations, three-category seed model, SW StaleWhileRevalidate stale-CSS gotcha. Open questions on achievements schema and mobile cache rollover.
2026-04-30 17:30 — DEPLOY — PR #1 merged, v1.38 live on GitHub Pages.
2026-04-30 17:45 — INCIDENT+RESOLVE — iPhone 17 Pro PWA showed Duo callout at bottom-left under grid (the SW cache rollover gotcha materialized in production). Diagnosis: HTML fresh (NetworkFirst), CSS stale (SWR via prior waiting SW). Fix: user clicked the Refresh toast → SW v1.38 activated → assets served fresh → callout displayed correctly. No code change needed. Open question for next session: should SW auto-skipWaiting on install to prevent recurrence?
2026-05-01 — AUDITS+FIXES — /eng-review and /mobile-pwa run; flagged abandonRun setTimeout leak, double-tap commit race, manifest-via-SWR. All three fixed in v1.43.
2026-05-01 — INCIDENT+RESOLVE (round 2) — same SW cache rollover bit again on v1.49 (achievement pills rendered plain white on iPhone). Permanent fix shipped as v1.50: versioned query strings on CSS/JS bypass the SWR cache mismatch. Resolution annotated on the dead end in arch.md and dev.md.
2026-05-01 — FEATURE — `[MODE]` picker with radial menu replaces `[HARD]` toolbar toggle. Three modes (Normal / Tetro / Long Shot), per-mode unlock paths. HARD retired as a top-level concept; existing users migrated. v1.56.
2026-05-01 — SYNC — captured v1.39 → v1.58 across all four roles. Decisions: animation polish wave, mode picker architecture, achievement set (13 total), versioned query strings, mode storage schema. Dead ends: abandonRun raw setTimeout, double-tap commit race, manifest in SWR, recap stuck-state, v1.39 over-deletion, indigo Perfect palette, HARD-as-orthogonal-toggle. Cross-role decisions and open questions refreshed in `_index.md`.
