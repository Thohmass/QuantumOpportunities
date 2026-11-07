# Maintenance

Status: v0.1 · 6 Nov 2026

## 1. Feedback channels

- **Email:** the address in `src/lib/config.ts` (placeholder until the real one exists), shown on the About page and in prefilled "correction" and "tell us" links on every event.
- **GitHub issue forms:** *Suggest an event* (label `suggestion`, picked up by the Scout; its PR closes the issue), *Correction*, *Bug or idea*.
- Email triage is manual for now (copy into an issue).

## 2. Monitoring

- Each data PR's body is the agent's report (checked, changed, created, uncertain, suspicious).
- `data/logs/<date>-<job>.md` is each run's research log: every search, every page read, every candidate and what was decided about it (created, updated, already known, lead, skipped and why).
- `data/runs.yaml` logs every run; the About page shows the last runs and how complete the data is.
- GitHub emails on failed workflows.

## 3. Your routine

| When | What | Time |
|---|---|---|
| First 4 weeks, after each run | Skim the data PR; open 3 changed events and compare with their sources | ~10 min |
| Weekly | Skim reports; review PRs that need you | ~10 min |
| Monthly | Agent usage vs your limits; caps; dead sources; taxonomy requests | ~20 min |

## 4. Housekeeping

- Dependency updates are deliberate PRs (allowlist + lockfile are protected).
- Broken official links are found by the Refresher's link check and get priority.
- Past events stay (history, expected editions), hidden by default.
- Taxonomy changes only by human PR; agents suggest them in reports.
- Each repeated agent mistake becomes one new rule in `agents/` or one new check.

## 5. When something goes wrong

- **Bad data merged:** revert the PR; add a rule or check.
- **Duplicate slipped through:** delete one file, add a `data/redirects.yaml` entry, add a test case.
- **Agent run misbehaves:** disable the workflow (Actions → … → Disable), review, lower caps.
- **Suspected token leak:** revoke it in your claude.ai account settings, create a new one, update the secret.
- **Site broken:** deploys come only from `main`; revert the last merge.

## 6. Licensing and attribution

Code MIT; data CC BY 4.0 ("Quantum Opportunities contributors"). Descriptions are our own words; facts link to sources. Country borders from Natural Earth (public domain); city coordinates from GeoNames (CC BY).
