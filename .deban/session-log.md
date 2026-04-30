# Session Log

Append-only timestamped event log.

---

2026-04-30 16:00 — INIT — mode: solo, roles: dev,ux,pm,arch
2026-04-30 16:00 — SYNC — recorded large in-flight session (`feat/one-shot-mode` branch, v20 → v1.38). Decisions captured across all four roles. Dead ends recorded for long-press tutorial drag, tiered streak durations, three-category seed model, SW StaleWhileRevalidate stale-CSS gotcha. Open questions on achievements schema and mobile cache rollover.
2026-04-30 17:30 — DEPLOY — PR #1 merged, v1.38 live on GitHub Pages.
2026-04-30 17:45 — INCIDENT+RESOLVE — iPhone 17 Pro PWA showed Duo callout at bottom-left under grid (the SW cache rollover gotcha materialized in production). Diagnosis: HTML fresh (NetworkFirst), CSS stale (SWR via prior waiting SW). Fix: user clicked the Refresh toast → SW v1.38 activated → assets served fresh → callout displayed correctly. No code change needed. Open question for next session: should SW auto-skipWaiting on install to prevent recurrence?
