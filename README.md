# Quantum Opportunities

Every quantum hackathon, conference and summer school on one map and timeline. Search, filter and
plan your year. Kept up to date by AI agents; every fact is sourced, and anything not found yet is
marked that way.

**Site:** https://thohmass.github.io/QuantumOpportunities/

## What you get

- **Explore** (on a PC): map, timeline and list side by side. Hover an event anywhere and it lights up everywhere; zoom the map to a region and everything else outside it fades; click a month or drag across the timeline to pick dates.
- **Filters** for type, topic, place, organiser, cost, dates, deadlines and more. Every view is a shareable link.
- **Details** for each event with sources, deadlines, and an “add to calendar” button.

## How the data works

- One YAML file per event in [`data/events/`](data/events). The git history of a file is its audit log.
- **A missing field means "not found yet"**, never "doesn't exist". `n/a` means checked and not applicable.
- **Expected** events are editions we predict from a series' past dates. They are marked as
  unconfirmed everywhere until an official source announces them.
- Every event links to the sources that support it, with the date they were checked.

Data agents run on a schedule (see [`docs/04-data-pipeline.md`](docs/04-data-pipeline.md)): a
**Scout** looks for new events every Wednesday and a **Refresher** re-checks events with missing or
stale data every Monday and Thursday. They can only change files in `data/`, and their pull requests
go through the same automatic checks as everything else before merging.

## Contributing

- **Suggest an event or a correction:** open an issue using one of the forms.
- **Edit data directly:** change or add a file in `data/events/<year>/`, run `npm run data:check`, open a PR.

## Development

```bash
npm ci
npm run dev          # local site with the current data
npm test             # unit tests
npm run data:check   # validate all data files
npm run build        # production build + size budget
```

Design docs live in [`docs/`](docs). Rules for agents: [`CLAUDE.md`](CLAUDE.md).

## Licence

Code: [MIT](LICENSE). Data in `data/`: [CC BY 4.0](data/LICENSE). Please credit "Quantum Opportunities contributors".
