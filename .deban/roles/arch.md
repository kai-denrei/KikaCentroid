---
name: arch
description: Data model, persistence tier, cache strategy, deployment topology
type: role
owner: Gerald
status: active
---

## Decisions

- **localStorage as the single persistence tier** (2026-04-30) — `kc-history` (last-10 runs, capped), `kc-seed-attempts` (seed→count map for replay tracking), `kc-hard-unlocked`, `kc-hard-mode-on`. Each run record: `{total, hard, ts, seed?, attempt?, origin?}`. Total payload is bytes; localStorage 5MB cap is irrelevant. No cloud, no auth, no cross-device sync. [[pm]]

- **Seed format `xxx-yyy-NNN`, Mulberry32-hashed** (2026-04-30) — two pronouncable letter syllables (CVC or VCV mix, 20-entry profanity blocklist) + 3-digit number. ~4B+ permutation space, collision-irrelevant for casual play. URL representation: `#s=aka-sop-921` (hash, not query — no SW navigation round-trip). [[dev]]

- **Service worker: NetworkFirst HTML, StaleWhileRevalidate CSS/JS** (2026-04-30) — kept from earlier; user clicks the orange "Refresh" toast to trigger `skipWaiting`. Trade-off: HTML/asset version skew during a single load cycle; mitigated with `!important` on the rules most likely to conflict. SW cache version bumped per release (`v1.NN`). [[dev]]

- **Deploy via GitHub Pages from `main`** (2026-04-30) — confirmed via `gh api`. Default branch is `main`, Pages enabled. Push to main = deploy to production. CLAUDE.md rule: never push to main directly; merge via PR.

- **Versioned query strings on CSS/JS** (2026-05-01) — `styles.css?v=1.NN` and `game.js?v=1.NN`, mirrored in `PRECACHE_URLS` via `ASSET_VER = CACHE_VERSION.replace(/^v/, '')`. Permanent fix for the StaleWhileRevalidate cache-rollover gotcha (see Dead Ends). HTML and SW must stay in lockstep on the version string; HTML carries inline comments. [[dev]]

- **Mode storage schema additions** (2026-05-01) — extends localStorage with `kc-mode` (active mode: `tetro` | `long_shot`; absent = default `normal`), `kc-tetro-unlocked` (`'1'` once unlocked), `kc-longshot-unlocked` (same). Migration: existing `kc-hard-unlocked` users auto-promoted to `kc-longshot-unlocked` at boot; `kc-hard-mode-on` legacy key removed silently. Achievement storage added earlier: `kc-achievements` is `{key: {unlocked: true, ts, runSeed}}` keyed by stable strings (`tier_2`...`tier_10`, `long_shot`, `marksman`, `sharpshooter`, `speed_demon`) so label renames don't break stored unlocks. [[dev]] [[pm]]

- **Originally separate cache logic for HTML vs assets had no version-bump escape hatch** (2026-04-30) — when CSS rules changed, the new SW would install but stay "waiting" until the user clicked Refresh. If they reloaded without clicking Refresh, they got fresh HTML against stale CSS — looked like the new feature was broken. Mitigated by `!important` on critical rules + clearer toast UX, not by a true cache strategy fix. The architectural fix (per-asset query-string cache busting on version bump, or auto-skipWaiting) is a future cleanup. **RESOLVED in v1.50** by versioned query strings on CSS/JS (`styles.css?v=1.50`, `game.js?v=1.50`). Each release uses a different URL → SW cache miss on stale SW → network fetch → fresh asset served immediately. Even if the new SW is still in `waiting` state, the OLD SW transparently serves the NEW CSS because the query string doesn't match anything in its cache. HTML and SW must stay in lockstep on the version string; HTML carries comments noting this.

## Open Questions

- Should `kc-history` grow beyond 10 entries? Currently capped to keep the sparkline readable. With achievements writing to history-derived stats, we may want an uncapped or bigger archive (`kc-history-all`?) separate from the display window.
- Achievements schema: `{id: {unlocked: true, ts, runSeed?, score?}}` in `kc-achievements`, or one combined `kc-state` blob? Combined gives migration headers; per-namespace is simpler.

## Assumptions

- iOS PWA storage persists across sessions for our scale of usage. ITP 7-day inactivity wipe is rare for a daily-play case but possible. Acceptable.
- Every user has the same `location.origin + pathname` — true for GitHub Pages serving from `main`, would break if someone forks the repo or hosts elsewhere with the same seed-share-URL pattern.

## Lessons

- "We can fix the user's confusion with documentation/UX hints" is rarely as cheap as it looks. The SW cache toast story took multiple round-trips with the user before the model was clear. Better to invest once in a proper cache rollover than to lean on `!important` and toast wording. — from dead end on 2026-04-30
- For PWA cache invalidation, prefer URL-level versioning over SW-level coordination. URL changes are cheap, atomic, and bypass any waiting/active SW timing puzzles. — from dead end on 2026-04-30
- Stable storage keys (numeric tier ids, snake_case feature ids) over labels. Storage outlives renames. — from decision on 2026-05-01

## Session Log

2026-05-01 — Cache rollover dead end RESOLVED via versioned query strings (v1.50). Mode storage schema extended for the [MODE] picker; HARD migration auto-promotes existing users. Manifest moved off SWR onto NetworkFirst. start_url cache-key mismatch fixed. Visibility gate added to the periodic SW update check.

2026-04-30 — Confirmed deploy topology (GitHub Pages from `main`). Persistence model recorded: localStorage-only, casual durability. Cache rollover dead end captured.
