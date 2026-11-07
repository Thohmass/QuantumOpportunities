# Data Model

Status: v0.1 · 6 Nov 2026 · the schemas in `schema/` are the source of truth; this doc explains them.

## 1. Storage layout

```
data/
  events/<start year>/<event-id>.yaml   one file per edition
  series/<series-id>.yaml               recurring series
  orgs/<org-id>.yaml                    organisers
  taxonomy/event-types.yaml, topics.yaml (hierarchical), audiences.yaml   — human-edited only
  sources.yaml      discovery source registry (Scout)
  queries.yaml      rotating discovery searches (Scout)
  leads.yaml        unverified hints, not shown on the site
  runs.yaml         one line per pipeline run
  not-duplicates.yaml   pairs that look alike but are different events
  redirects.yaml    old id → new id, so shared links survive merges
  LICENSE           CC BY 4.0
```

`npm run data:build` compiles everything into `public/data/events.json` (events plus derived fields) and `public/data/meta.json` (taxonomies, organisations, series, redirects, data health). The site loads only these two files.

## 2. Unknown vs not applicable

- **Absent key = not found yet.** No `null`, no empty strings.
- **`n/a` = checked, doesn't apply.** Allowed on `deadlines`, `audience`, `team`, `hardware`, `prizes`, `support`.
- The site never renders an absent field as "none", "free" or "no".

## 3. Event

```yaml
id: qhack-2027
series: qhack
name: QHack 2027
type: hackathon               # data/taxonomy/event-types.yaml
status: expected              # confirmed | expected | postponed | cancelled
format: online                # in_person | online | hybrid
dates: { start: 2027-10 }     # YYYY | YYYY-MM | YYYY-MM-DD (+ end, note)
deadlines:                    # or n/a
  - { kind: application, date: 2027-09-30, note: … }   # application | registration | abstract | early_bird | other
location: { city: Copenhagen, country: DK, venue: …, latlon: [55.7, 12.6], note: … }   # omit when online
organizers: [xanadu]          # org ids
partners: [ionq]
topics: [computing, qc-software, qml]
audience: [msc, phd, anyone]  # or n/a
eligibility: Open to all; 18+
team: { min: 1, max: 4, note: … }          # or n/a
hardware: { real_qpu: false, note: … }     # or n/a
prizes: "2026: up to US$67,000 cash"       # or n/a
cost: { kind: free, min: 0, max: 0, currency: EUR, note: … }   # free | paid | mixed
support: { travel_grants: true, note: … }  # or n/a
url: https://qhack.ai/
registration_url: https://…
description: ≤ 400 characters, in our own words
expected: { basis: Annual; QHack 2026 ran 16–23 Oct 2026, confidence: medium }   # only when expected
sources:
  - { url: https://qhack.ai/, kind: official, accessed: 2026-10-23, note: … }   # official | organiser_social | aggregator | news | other
checks: { last_checked: 2026-10-23, unchanged_streak: 0 }
added: { date: 2026-10-23, by: radar-import }
```

**Required:** id, name, type, status, format, dates.start, sources (≥ 1), checks, added.
**Critical for completeness** (drive the refresh queue and the About page): exact dates, end date, location (unless online), official page, deadline (schools, hackathons, programmes, challenges), cost, team size (hackathons, challenges).
**Derived at build:** continent, coordinates (geocoded), missing critical fields. **Derived in the browser:** past/ongoing, next open deadline, registration state, next relevant date.

## 4. Series and organisations

```yaml
# data/series/qhack.yaml
id: qhack
name: QHack
organizers: [xanadu]
cadence: annual            # annual | biennial | irregular | one_off
typical_month: 10
url: https://qhack.ai/
aliases: [Xanadu QHack]

# data/orgs/niels-bohr-institute.yaml
id: niels-bohr-institute
name: Niels Bohr Institute
type: university           # university | company | research_institute | community | government | other
parent: university-of-copenhagen
country: DK
city: Copenhagen
url: https://nbi.ku.dk/
aliases: [NBI]
```

## 5. IDs

`<series-id>-<year>` for editions (add a suffix if a series runs twice a year); `<slug-of-name>-<year>` for one-offs. Lowercase ASCII and hyphens, ≤ 60 characters, never changed. The file is `<id>.yaml` in the folder of the start year.

## 6. Taxonomies

- **Event types:** conference, workshop, hackathon, summer_school, winter_school, challenge, programme, meetup, career_fair, other.
- **Topics:** computing → qc-hardware (hw-superconducting, hw-trapped-ions, hw-photonics, hw-neutral-atoms, hw-spins, hw-topological), qc-algorithms, qc-software, qec, qc-benchmarking; communication → qkd, networks; sensing; simulation; qml; qit; materials; optics; pqc; education; business.
- **Audiences:** highschool, bsc, msc, phd, postdoc, researcher, industry, anyone (restrictions go in `eligibility`).

## 7. Validation — `npm run data:check` (CI `data` check)

Schemas; references (types, topics, audiences, organisations, series, parents); file name = id and folder = start year; unique ids; `end ≥ start`; deadlines after the end (warning); team/cost ranges; `expected` ⇔ `expected` block; `confirmed` needs an official or organiser source; online events without location (warning); city geocodes or `latlon` given; `last_checked ≥ added`; same official URL in the same year; name similarity ≥ 0.85 with matching dates/country — unless listed in `not-duplicates.yaml`.

## 8. Seed (6 Nov 2026)

27 events imported from the Quantum Hackathon Radar (checked 23 Oct – 4 Nov 2026; personal fit ratings and tracking marks not imported), 11 conferences and schools from official pages, 3 expected editions generated by `npm run stubs`; 38 series, 52 organisations, 14 discovery sources, 20 queries, 12 leads.
