# Overnight research chain — 7–8 Nov 2026 (orchestration log)

Goal: grow the database from 41 to at least 100 events, spread across regions, event types and months, so the
map, timeline and list can be judged with real density. Stop at 100, or earlier if yield drops below ~1 new event
per 5 candidates for three rounds in a row.

Method, cheapest first: (1) the leads already in `data/leads.yaml`; (2) aggregator pages that list many events
(one read → many candidates); (3) targeted searches for gaps (regions, types, months). Every candidate is checked
against the index and `npm run find-similar` before it is created; every created event cites an official page.

Legend: **+** created · **=** already in the database · **–** skipped (reason) · **?** lead kept for later.

## What happened

A manual research round in the chat session was started (6 official pages read) and then handed to the scheduled
Scout on GitHub, so it could run without permission prompts. Each Scout run's own research log is in this folder
(`2026-11-07-scout*.md`, `2026-11-08-scout*.md`); this file records how the runs were chained.

## GitHub Scout runs (the scheduled agent, chained overnight)

- 23:59 run 42423152002: failed at once, before any work (Claude token secret invalid). Token renewed by Tomáš.
- 00:06 run 42423673734: agent worked (58 turns) but its PR could not be pushed (Claude App token revoked when
  the agent step ends). Fixed in PR #8 (DATA_PR_TOKEN). Work lost.
- 00:47 run 42426753387 → PR #9 merged: 0 events; every find-similar call refused (command form). Fixed in #10.
- 00:56 run 42427399179 → PR #11 merged: +5 events (Les Houches schools) → 46.
- 01:00 run 42427803993 → PR #12: +6 events → 52.
- 01:03 run 42428083036 → PR #13: +3 events (DPG SAMOP, CLEO/Europe-EQEC, APS QIS) → 55. Runs stop after ~45 turns with sources and queries not reached; chain continues (stop at 100, 15 runs, or two runs with ≤1 new).
- 01:09 run 42428534633 → PR #14: +3 → 58.
- 01:14 run 42428750050 → PR #15: +6 → 64.
- 01:19 run 42429168960 → PR #16: +4 → 68.
- 01:24 run 42429409807 → PR #17: +1 (IQT Korea 2026) → 69. Yield falling because each run stops after the first few leads.
- 01:35 PR #18 (merged): 27 research leads for the Scout (rest of the quantum.info 2027 list with official links, recurring events, regional gaps), so each run starts from concrete candidates.
- 01:31 run 42430275142 → PR #19: +6 → 75.
- 01:36 run 42430595729 → PR #20: +0 (unitaryHACK not yet announced; Vilnius hackathon without official page).
- 01:42 run 42431035872 → PR #21: +4 → 79.
- 01:46 run 42431333827 → PR #22: +2 → 81.
- 01:51 run 42431542842 → PR #23: +1 → 82.
- 01:55 run 42432000005 → PR #24: +1 (QCMC 2027) → 83.
- 02:00 run 42432220899 → PR #25: +1 (GRC Quantum Biology) → 84. Announced 2027 events are mostly captured; recurring events without a 2027 page stayed leads.
- 02:08 PR #26: hints of 12 recurring-event leads point to the expected-edition rule (create 2027 as Expected from past official editions).
- 02:12 run 42432797400 → PR #27: +0 (searches found only 2025/2026 editions; leads not retried that run).

## Result

- 41 → 84 events (+43) in 13 productive runs, all merged automatically after CI. Stopped short of 100.
- Why it stopped: announced 2027 events from the main sources are largely in. The rest are recurring events
  whose 2027 edition has no page yet (unitaryHACK, Qiskit Global Summer School, Quantum Korea, Quantum World
  Congress, Q2B Tokyo/Paris, QTML, Prague and CERN hackathons, ...). The agent keeps them as leads instead of
  creating Expected editions, and each run ends after 20–60 turns (well below its caps), handling 2–6 candidates.
- Spread now: Europe 50, North America 14, Asia 7, online 7, Oceania 2, Africa 1 (3 without a place);
  conferences 29, hackathons 26, workshops 11, schools 14, other 4; 17 expected.
- Fixes made on the way: token secret renewed; PRs opened with DATA_PR_TOKEN (#8); command forms allowed (#10);
  research log for every agent run (#7); leads for the Scout (#18, #26).
