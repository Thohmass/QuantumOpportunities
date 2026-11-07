# Data Pipeline — Scout, Refresher, expected editions

Status: v0.1 · 6 Nov 2026

## 1. Goals

1. Find new opportunities without creating duplicates.
2. Fill missing fields and catch changes without re-researching data that is known and fresh.
3. Keep every claim sourced and every unknown honest.
4. Stay inside a fixed budget per run, spent where it matters most.

Everything a script can decide is decided by a script (what to check and in what order, duplicates, expected editions). The agent only does the part that needs reading the web.

## 2. Runs

| Workflow | When | Steps |
|---|---|---|
| **Refresher** | Mon + Thu 04:23 UTC, or by hand | expected-edition stubs → link check → queue → agent (≤ 25 events) → guard → PR |
| **Scout** | Wed 04:41 UTC, or by hand | index, sources, queries, suggestion issues → agent → guard → PR |
| **Deploy** | every merge to `main` + daily 05:17 UTC | build and publish (keeps data health current) |

Both agent runs share a concurrency group and **skip while an earlier `data/…` PR is still open**, so runs never pile up or conflict. The Refresher skips the agent entirely when nothing is due (costs nothing).

## 3. Expected editions (no AI) — `npm run stubs`

For every `annual`/`biennial` series whose latest edition has started and whose next edition doesn't exist yet, create `<series>-<year>.yaml` with `status: expected`, the month of the last dated edition, `expected.basis` and a confidence (high with 2+ dated editions, medium with 1, low otherwise). Only within 12 months ahead.

## 4. The refresh queue (no AI) — `npm run queue`

For each upcoming, non-cancelled event:

- **Key date:** next open deadline, else start. **Tier** by days to it: ≤ 30 A, ≤ 90 B, ≤ 180 C, else D.
- **Interval:** A 3, B 7, C 14, D 30 days × 2^min(unchanged_streak, 3), × 2 when nothing critical is missing, capped at 60.
- **Due** when `last_checked + interval ≤ today`, or when the link checker flagged its official URL.
- **Priority:** tier weight (8/4/2/1) × (1 + missing critical fields) + 3 for an expected edition in tiers A–C + 5 when flagged.

Critical fields: exact dates, end date, location (not online), official page, deadline (schools, hackathons, programmes, challenges), cost, team size (hackathons, challenges).

## 5. Refresher (agents/refresher.md)

Works through the queue: official page first, fills what sources support, promotes expected → confirmed only on an official announcement, always updates `checks.last_checked` and `unchanged_streak` (this is what stops the same unknown being researched every run). New events it stumbles on go to `data/leads.yaml`.

## 6. Scout (agents/scout.md)

Reads the compact index (`npm run index`), confirms leads and `suggestion` issues, scans the 8 sources scanned longest ago (`data/sources.yaml`) and runs the 6 queries used longest ago (`data/queries.yaml`), updating their scan/yield counters. Sources with no new events for 6 scans in a row are rested for 8 weeks. Creates events only with an official page, otherwise leads.

## 7. Duplicate defence

1. Deterministic IDs (`<series>-<year>`). 2. Series linking. 3. `npm run find-similar` before any creation (normalised URL, trigram name similarity with generic words ignored, date overlap, country). 4. The CI `data` check (same series + year, same URL + year, similarity ≥ 0.85), with `data/not-duplicates.yaml` for genuine look-alikes.

## 8. Output and caps

One branch and one data-only PR per run (`data/refresh/<date>-<run>`, `data/scout/<date>-<run>`), authored by the Claude App, body = the agent's report. Caps: Refresher 25 events, ~80 fetches, 90 turns, 45 min; Scout 30 candidates, 20 new events, ~80 fetches, 110 turns, 50 min. Model: Sonnet 5.5.
