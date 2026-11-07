# Quantum Opportunities — Overview

Status: **v0.1 (MVP built)** · 6 Nov 2026 · owner: Tomáš · repo: [Thohmass/QuantumOpportunities](https://github.com/Thohmass/QuantumOpportunities)

## 1. What it is

A fast static website that lists opportunities in quantum science and technology: conferences, hackathons, summer and winter schools, workshops, challenges and competitions, training programmes. On a PC you see a **map**, a **timeline** and a **list** at the same time, linked together; on a phone they are tabs. Filters cover place, organiser, type, topic, cost and dates. The data lives as plain files in this repo. Scheduled AI agents keep it current: they look for new events and fill in what is still missing.

- **Primary users:** Tomáš and his QIS classmates (UCPH/DTU).
- **Secondary users:** anyone in the quantum community.
- **Replaces/absorbs:** the "Quantum Hackathon Radar" artifact (27 of its events were imported on 6 Nov 2026). Its weekly check keeps running until the first two agent runs here have merged, then it is retired.

## 2. Principles

1. **Honest data.** A missing value means we haven't found it yet, not that it doesn't exist. The site shows it as *Not found yet*, never as blank or "none". An event we only expect to happen is labelled **Expected (unconfirmed)** and drawn differently everywhere.
2. **Every fact has a source.** A field gets filled only when a linked source supports it.
3. **One connected picture.** Where, when and what at a glance: hovering an event anywhere highlights it everywhere (see 07-design-vision).
4. **Fast and frictionless.** Instant load on a phone, filters that respond as you tap, every view shareable by URL. No accounts, no cookies, no tracking.
5. **Research is spent only where it pays.** Agents get a compact index of what we have and a deterministic queue of what is missing or stale. They never re-research fresh, known data and never create duplicates.
6. **Agents can't break the site.** Data agents can only change `data/**`; token-free CI validates every change before it goes live.

## 3. Doc map

| Doc | What it covers |
|---|---|
| 00-overview (this) | Vision, principles, glossary, decisions |
| 01-mvp-spec | Views, filters, behaviour, non-functional targets, acceptance criteria |
| 02-data-model | Event/series/organisation schema, status and unknown semantics, IDs, taxonomies |
| 03-dev-pipeline | Stack, repo layout, CI gates, merge policy, how it reuses Lynote's pipeline |
| 04-data-pipeline | Scout and Refresher runs, expected editions, dedup, the research queue |
| 05-maintenance | Feedback channels, monitoring, routine, incident handling, licensing |
| 06-roadmap | After the MVP |
| 07-design-vision | Linked views, map as a lens, timeline selection, future visual identity |

## 4. Glossary

- **Event:** one edition with dates, e.g. *QHack 2027*. **Series:** the recurring thing behind editions, e.g. *QHack*.
- **Organisation:** university, company, research institute, community, government body or other organiser.
- **Status:** `confirmed`, `expected`, `postponed`, `cancelled`. *Past* is computed from dates.
- **Not found yet / n/a:** an absent field means not found yet; `n/a` means checked and not applicable.
- **Lead:** a hint without an official page yet (`data/leads.yaml`), not shown on the site.
- **Queue:** the prioritised list of events due for re-checking, computed before each Refresher run.
- **Run:** one agent session; it produces one data-only PR with a report.

## 5. Decisions (settled 6 Nov 2026)

| Decision | Choice |
|---|---|
| Hosting | GitHub Pages, static, no server; deployed from `main` and rebuilt daily |
| Repo | Public, `Thohmass/QuantumOpportunities`. Code MIT, data CC BY 4.0 (`data/LICENSE`) |
| MVP scope | Events and fixed-date programmes; jobs, PhD calls and grants later |
| Data storage | One YAML file per event, compiled to one JSON at build; git history is the audit log |
| Frontend | Svelte 5 + Vite + TypeScript; our own minimal SVG world map (d3-geo + d3-zoom, Natural Earth 1:110m borders, lazy-loaded); MiniSearch |
| Geocoding | Build-time lookup from city + country (GeoNames via `all-the-cities`), optional `latlon` override |
| Where agents run | GitHub Actions + `claude-code-action`, as in Lynote, not claude.ai routines |
| Agent credential | Subscription token (`CLAUDE_CODE_OAUTH_TOKEN`) for now |
| Data PR merge | Auto-merge when data-only and every check passes; Tomáš spot-checks 3 events per run for the first month |
| Code PR merge | Tomáš merges; agents never merge their own code |
| Feedback email | Placeholder in `src/lib/config.ts` until the real address exists |
| Custom domain | Later |

## 6. Open

- Real feedback email address.
- Create the `main` branch ruleset (03-dev-pipeline §6): required for auto-merging data PRs.
- When to retire the Radar artifact's scheduled check.
- Visual identity and Easter eggs (07-design-vision §2–3).
