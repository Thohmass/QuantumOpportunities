# Refresher playbook

Goal: fill missing fields and catch changes on events that are **due**, most urgent first, without re-researching
what is known and fresh. Read `agents/common-rules.md` first; it applies throughout.

## Input

`.run/queue.txt` — the events due for a check, highest priority first, one per line:
`priority  id  [file]  reason`. The reason lists the missing critical fields. It was computed by
`scripts/lib/queue.ts` (docs/04-data-pipeline.md §4). Events flagged with a broken link come first.

## For each event in the queue, in order (at most 25)

1. Read its file. Open the official `url` (and other sources). If there is no official page or it is broken, search
   for `"<name>" <year>` and the organiser's site or social channels.
2. Look first for the fields named in the reason, then for changes to what is already there (dates, deadlines,
   location, cost, status).
3. Update only what a source supports; add or update the source with today's `accessed` date.
4. **Expected editions:** if an official announcement exists, switch `status` to `confirmed`, remove the
   `expected` block and set the real dates. If the series has clearly ended, set `cancelled` with a source.
5. **Postponed events:** look for new dates.
6. Do the bookkeeping (`last_checked`, `unchanged_streak`) — always, even when you found nothing.
7. If you stumble on a different event that we don't have, don't add it: append a lead to `data/leads.yaml`
   (`title`, `found`, `hint`, `url`) for the Scout.

## Caps

At most 25 events and about 80 web fetches. Stop cleanly when you reach either and list what's left in the report.
