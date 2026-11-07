# Dev Pipeline

Status: v0.1 · 6 Nov 2026 · builds on the *Lynote Agentic Dev Pipeline — Design v0.2* and Lynote's Phase 1 gates.

## 1. How this relates to Lynote

| | Lynote | Quantum Opportunities |
|---|---|---|
| What's at stake | Private notes, signing keys, E2E crypto | Public event data on a static site; no user data |
| Repo | Private | Public |
| Agents run in | GitHub Actions + `claude-code-action` | Same |
| Gates | Token-free scripts; `policy.json` read from `main` | Same, ported (`tool/ci/qo_ci.py`) |
| Web access for agents | Banned | Required for data agents; they get nothing else |
| Auto-merge list | docs/, new tests | docs/, new tests, **data-only agent PRs** |
| Agent team | 6 roles | 2 data roles (Scout, Refresher); dev roles later |

**Main new risk: prompt injection from web pages** read by data agents. Controls that hold even if an agent is fully hijacked:

1. Claude's tool allowlist is Read/Write/Edit/Glob/Grep, WebSearch/WebFetch and a few `npm run` data scripts. **No git, no `gh`, no general shell.**
2. A deterministic step after Claude rejects any change outside `data/` (and to `data/taxonomy/`, `data/LICENSE`), runs `npm run data:check`, then commits, pushes and opens the PR itself (with `DATA_PR_TOKEN`, §6).
3. `pr-policy` (rules read from `main`) hard-fails agent PRs touching `.github/` and requires the owner for anything outside the auto-merge list.
4. The only secret in the job is the Claude credential. Text from data is always rendered as text on the site; links must be `https://`.

## 2. Stack

Svelte 5, Vite 8, TypeScript (strict); own SVG map with d3-geo, d3-zoom and topojson-client over world-atlas (Natural Earth 1:110m) in a lazy chunk; MiniSearch. Data scripts in TypeScript (`tsx`), `ajv` (JSON Schema 2020-12), `yaml`, `all-the-cities` for geocoding. Vitest unit tests; Playwright smoke tests on desktop and mobile viewports. Prettier + `svelte-check` (no ESLint in v0.1).

## 3. Repo layout

```
src/                  app: App.svelte, components/, lib/ (filters, url, search, model, dates, geo, format, ics)
data/                 the database (02-data-model); data/LICENSE = CC BY 4.0
schema/               JSON Schemas
scripts/              validate, build-data, index, find-similar, queue, stubs, linkcheck, scout-prep, size-budget
scripts/lib/          shared logic with unit tests
agents/               common-rules.md, scout.md, refresher.md
tool/ci/              policy.json, qo_ci.py and its tests, dependency allowlist
e2e/                  Playwright smoke tests
.github/workflows/    ci, pr-policy, deploy, scout, refresher
.github/ISSUE_TEMPLATE/  suggest-event, correction, bug
docs/                 these docs
```

## 4. CI gates (token-free, every PR)

| Check | Fails when |
|---|---|
| `policy` | Gate self-tests fail; a direct dependency not on `tool/ci/dependency_allowlist.txt`; stale lockfile |
| `lint-types` | Prettier or `svelte-check` (TypeScript + Svelte) errors or warnings |
| `test` | A Vitest unit test or a Playwright smoke test fails |
| `data` | Schema, references, date order, status rules, geocoding or duplicate checks fail |
| `build` | The build fails or exceeds the size budget |
| `secrets-scan` | gitleaks finds a secret |
| `dependency-vulns` | OSV-Scanner finds a vulnerability not accepted in `osv-scanner.toml` |
| `workflow-lint` | zizmor flags a workflow; actions must be pinned to commit hashes |
| `pr-policy` | Protected path without the owner's approval; agent touching `.github/`; agent PR outside the auto-merge list |

**Protected paths:** `.github/`, `.claude/`, `CLAUDE.md`, licences, `package*.json`, configs, `osv-scanner.toml`, `tool/ci/`, `schema/`, `data/taxonomy/`, `agents/`, `scripts/size-budget.ts`.
**Auto-merge (agent PRs):** `data/events|series|orgs/`, `data/leads|sources|queries|runs|not-duplicates|redirects.yaml`, `docs/` (not `docs/decisions/`), new test files.

## 5. Merge policy

- **Data PRs from agents** (branches `data/…`, author `claude[bot]`): `pr-policy` marks them eligible and its `enable-auto-merge` job turns on GitHub auto-merge (squash). They merge only when every required check is green — which needs the ruleset in §6.
- **Code PRs:** Tomáš reviews and merges. Agents never merge.
- A bad merge is undone with a revert PR.

## 6. Setup steps only the owner can do

1. **Ruleset on `main`** (Settings → Rules → Rulesets → New branch ruleset): target the default branch; no bypass; restrict deletions; block force pushes; require a pull request (0 approvals, squash only); require status checks: `policy`, `lint-types`, `test`, `data`, `build`, `secrets-scan`, `dependency-vulns`, `workflow-lint`, `pr-policy`. The build session could not create it (the session's GitHub access can't write repository settings).
2. Secret `CLAUDE_CODE_OAUTH_TOKEN` (done 6 Nov 2026; renewed 8 Nov 2026).
3. Secret `DATA_PR_TOKEN`: a fine-grained personal access token for this repository only, with *Contents* and *Pull requests* read/write. The agent workflows use it after the agent has finished to push the data branch and open the PR (the Claude App token is revoked when the agent step ends, and PRs opened with `GITHUB_TOKEN` don't trigger CI). The agent never sees it. Renew it before it expires.
4. Optionally run *Scout* and *Refresher* once by hand (Actions → workflow → Run workflow) after the MVP merges.

## 7. How the MVP was built

One uninterrupted session on 6 Nov 2026, phase by phase on the `mvp` branch (PR #2) with CI on every push: 0 scaffold & deploy · 1 gates · 2 data foundation · 3 seed · 4–8 app (explore, list, timeline, map, detail, About) · 9 agents · 10 release checks. The build session can't merge PRs itself (by design), so Tomáš merges.

## 8. After the MVP: dev agents

Reuse Lynote's Developer + Reviewer workflows (approved issues → one PR each). Quantum Opportunities becomes the second user of the reusable agent-team setup planned for Lynote.
