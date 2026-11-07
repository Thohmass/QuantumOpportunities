#!/usr/bin/env python3
"""Quantum Opportunities' token-free CI gates (ported from Lynote's lynote_ci.py).

Every check here is deterministic: it reads files or the GitHub API and returns
pass/fail. Nothing here calls a model. Standard library only, so the gates have
no dependencies to install or poison.

Subcommands:
  deps       package.json's direct dependencies match the allowlist
  pr-policy  protected paths, test integrity, agent rules, auto-merge eligibility
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
POLICY_PATH = ROOT / "tool" / "ci" / "policy.json"


def load_policy(path: Path = POLICY_PATH) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _summary(text: str) -> None:
    """Append markdown to the GitHub job summary when running in Actions."""
    target = os.environ.get("GITHUB_STEP_SUMMARY")
    if target:
        with open(target, "a", encoding="utf-8") as f:
            f.write(text + "\n")


def _starts_with_any(path: str, prefixes: list[str]) -> bool:
    return any(path == p or path.startswith(p) for p in prefixes)


# --------------------------------------------------------------------------
# Dependency allowlist (direct dependencies)
# --------------------------------------------------------------------------

def direct_dependencies(package_json: dict) -> set[str]:
    names: set[str] = set()
    for key in ("dependencies", "devDependencies", "optionalDependencies", "peerDependencies"):
        names.update((package_json.get(key) or {}).keys())
    return names


def read_allowlist(path: Path) -> set[str]:
    return {
        line.strip()
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    }


def lockfile_matches(package_json: dict, lock: dict) -> list[str]:
    """Direct dependencies that are missing from package-lock.json (lockfile out of date)."""
    root = (lock.get("packages") or {}).get("", {})
    locked = direct_dependencies(root)
    return sorted(direct_dependencies(package_json) - locked)


def cmd_deps(_: argparse.Namespace) -> int:
    policy = load_policy()
    pkg = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    lock = json.loads((ROOT / "package-lock.json").read_text(encoding="utf-8"))
    allowed = read_allowlist(ROOT / policy["dependency_allowlist_file"])
    direct = direct_dependencies(pkg)
    new = sorted(direct - allowed)
    gone = sorted(allowed - direct)
    stale = lockfile_matches(pkg, lock)
    failed = False
    if gone:
        print("No longer used (can be removed from the allowlist): " + ", ".join(gone))
    if new:
        failed = True
        print("Packages not on the dependency allowlist: " + ", ".join(new))
        print("Adding a dependency needs an approved issue and the owner's approval of the allowlist change.")
        if os.environ.get("GITHUB_ACTIONS"):
            print("::error file=package.json::Packages not on the dependency allowlist: " + ", ".join(new))
        _summary("### Dependency allowlist: FAILED\nNew packages: " + ", ".join(f"`{n}`" for n in new))
    if stale:
        failed = True
        print("package-lock.json is out of date for: " + ", ".join(stale))
    if not failed:
        print(f"Dependency allowlist: OK ({len(direct)} direct dependencies)")
    return 1 if failed else 0


# --------------------------------------------------------------------------
# Pull-request policy
# --------------------------------------------------------------------------

@dataclass
class ChangedFile:
    path: str
    status: str  # added | modified | removed | renamed | copied | changed | unchanged
    patch: str | None = None
    previous_path: str | None = None


@dataclass
class Decision:
    passed: bool
    hard_fail: list[str] = field(default_factory=list)
    needs_owner: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    auto_merge_eligible: bool = False


def _added_lines(patch: str | None) -> list[str]:
    if not patch:
        return []
    return [l[1:] for l in patch.splitlines() if l.startswith("+") and not l.startswith("+++")]


def _is_test(path: str, policy: dict) -> bool:
    return any(re.search(p, path) for p in policy["test_patterns"])


def auto_merge_eligible(files: list[ChangedFile], policy: dict) -> bool:
    cfg = policy["auto_merge"]
    if not files:
        return False
    for f in files:
        paths = [f.path] + ([f.previous_path] if f.previous_path else [])
        on_list = all(
            _starts_with_any(p, cfg["path_prefixes"]) and not _starts_with_any(p, cfg["exclude_prefixes"])
            for p in paths
        )
        new_test = cfg.get("allow_added_tests", False) and f.status == "added" and _is_test(f.path, policy)
        if not (on_list or new_test):
            return False
    return True


def is_agent(author: str, branch: str, policy: dict) -> bool:
    return author in policy["agent_logins"] or _starts_with_any(branch, policy.get("agent_branch_prefixes", []))


def decide(
    files: list[ChangedFile],
    author: str,
    owner: str,
    owner_approved_head: bool,
    policy: dict,
    branch: str = "",
) -> Decision:
    d = Decision(passed=False)
    agent = is_agent(author, branch, policy)
    protected = policy["protected_paths"]

    for f in files:
        paths = [f.path] + ([f.previous_path] if f.previous_path else [])
        if agent and any(p.startswith(".github/") for p in paths):
            d.hard_fail.append(f"agents may not change workflows: {f.path}")
        if any(_starts_with_any(p, protected) for p in paths):
            d.needs_owner.append(f"protected path: {f.path}")
        if any(_is_test(p, policy) for p in paths):
            if f.status in ("modified", "removed", "renamed", "changed"):
                d.needs_owner.append(f"existing test {f.status}: {f.path}")
            elif f.patch is None and f.status != "removed":
                d.needs_owner.append(f"test diff not readable, review manually: {f.path}")
            if any(re.search(r"\.(skip|only|todo)\(|\btest\.fixme\(", l) for l in _added_lines(f.patch)):
                d.needs_owner.append(f"test skip/only added: {f.path}")
        if f.path.startswith(("src/", "scripts/")) and any(
            re.search(r"@ts-(ignore|nocheck|expect-error)|svelte-ignore", l) for l in _added_lines(f.patch)
        ):
            d.needs_owner.append(f"type-check suppression added: {f.path}")

    d.auto_merge_eligible = (not d.hard_fail) and (not d.needs_owner) and auto_merge_eligible(files, policy)
    if agent and not d.auto_merge_eligible and not d.hard_fail:
        d.needs_owner.append("agent PR outside the auto-merge list")

    if d.hard_fail:
        d.passed = False
    elif not d.needs_owner:
        d.passed = True
    elif author == owner and not agent:
        d.passed = True
        d.notes.append("PR authored by the owner; owner-only changes are allowed without a second approval.")
    elif owner_approved_head:
        d.passed = True
        d.notes.append("Owner approved the current head commit.")
    return d


def _gh_get(url: str, token: str) -> object:
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _gh_paged(url: str, token: str) -> list:
    items: list = []
    page = 1
    while True:
        batch = _gh_get(f"{url}{'&' if '?' in url else '?'}per_page=100&page={page}", token)
        assert isinstance(batch, list)
        items.extend(batch)
        if len(batch) < 100:
            return items
        page += 1


def owner_approved(reviews: list[dict], owner: str, head_sha: str) -> bool:
    """True if the owner's most recent decisive review approves exactly the head commit."""
    state = None
    for r in reviews:  # API returns chronological order
        if (r.get("user") or {}).get("login") != owner:
            continue
        if r.get("state") in ("APPROVED", "CHANGES_REQUESTED", "DISMISSED"):
            state = (r.get("state"), r.get("commit_id"))
    return state == ("APPROVED", head_sha)


def cmd_pr_policy(_: argparse.Namespace) -> int:
    env = os.environ
    token, repo, number = env["GITHUB_TOKEN"], env["REPO"], env["PR_NUMBER"]
    author, owner, head_sha = env["PR_AUTHOR"], env["OWNER_LOGIN"], env["HEAD_SHA"]
    branch = env.get("HEAD_REF", "")
    api = env.get("GITHUB_API_URL", "https://api.github.com")
    policy = load_policy()  # loaded from the BASE branch checkout, so a PR can't loosen it

    raw_files = _gh_paged(f"{api}/repos/{repo}/pulls/{number}/files", token)
    files = [ChangedFile(f["filename"], f["status"], f.get("patch"), f.get("previous_filename")) for f in raw_files]
    reviews = _gh_paged(f"{api}/repos/{repo}/pulls/{number}/reviews", token)
    d = decide(files, author, owner, owner_approved(reviews, owner, head_sha), policy, branch)

    lines = [
        f"### PR policy: {'PASSED' if d.passed else 'BLOCKED'}",
        f"Author: `{author}`, branch `{branch}`; {len(files)} file(s) changed.",
    ]
    if d.hard_fail:
        lines += ["**Not allowed:**"] + [f"- {x}" for x in d.hard_fail]
    if d.needs_owner:
        lines += [f"**Needs approval from @{owner} on the current commit:**"] + [f"- {x}" for x in sorted(set(d.needs_owner))]
    lines += [f"- {n}" for n in d.notes]
    lines.append(f"Auto-merge eligible: {'yes' if d.auto_merge_eligible else 'no'}")
    print("\n".join(lines))
    _summary("\n".join(lines))
    out = env.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as f:
            f.write(f"auto_merge_eligible={'true' if d.auto_merge_eligible else 'false'}\n")
    return 0 if d.passed else 1


# --------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("deps", help="direct dependencies match the allowlist").set_defaults(fn=cmd_deps)
    sub.add_parser("pr-policy", help="protected paths, test integrity, agent rules").set_defaults(fn=cmd_pr_policy)
    args = parser.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
