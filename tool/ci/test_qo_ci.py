"""Self-tests for the CI gates. Run: python3 -m unittest discover -s tool/ci -p 'test_*.py'"""
import unittest

import qo_ci
from qo_ci import ChangedFile as F

POLICY = qo_ci.load_policy()
OWNER = "Thohmass"
AGENT = "claude[bot]"


def decide(files, author=AGENT, approved=False, branch=""):
    return qo_ci.decide(files, author, OWNER, approved, POLICY, branch)


class DataPrs(unittest.TestCase):
    def test_agent_data_only_pr_auto_merges(self):
        d = decide([F("data/events/2027/qhack-2027.yaml", "modified"), F("data/sources.yaml", "modified")])
        self.assertTrue(d.passed)
        self.assertTrue(d.auto_merge_eligible)

    def test_agent_new_event_auto_merges(self):
        d = decide([F("data/events/2027/new-hack-2027.yaml", "added"), F("data/orgs/new-org.yaml", "added")])
        self.assertTrue(d.auto_merge_eligible)

    def test_agent_taxonomy_change_needs_owner(self):
        d = decide([F("data/taxonomy/topics.yaml", "modified")])
        self.assertFalse(d.passed)
        self.assertFalse(d.auto_merge_eligible)

    def test_agent_data_licence_needs_owner(self):
        self.assertFalse(decide([F("data/LICENSE", "modified")]).passed)

    def test_agent_code_change_needs_owner(self):
        d = decide([F("data/events/2027/x.yaml", "added"), F("src/App.svelte", "modified")])
        self.assertFalse(d.passed)
        self.assertIn("agent PR outside the auto-merge list", d.needs_owner)

    def test_rename_out_of_data_is_not_auto_merge(self):
        d = decide([F("scripts/evil.ts", "renamed", previous_path="data/events/2027/x.yaml")])
        self.assertFalse(d.auto_merge_eligible)

    def test_data_branch_counts_as_agent_even_for_owner_login(self):
        d = decide([F("src/App.svelte", "modified")], author=OWNER, branch="data/scout/2026-11-12")
        self.assertFalse(d.passed)


class Workflows(unittest.TestCase):
    def test_agent_may_never_touch_workflows(self):
        d = decide([F(".github/workflows/ci.yml", "modified")], approved=True)
        self.assertFalse(d.passed)
        self.assertTrue(d.hard_fail)

    def test_owner_may_change_workflows(self):
        d = decide([F(".github/workflows/ci.yml", "modified")], author=OWNER)
        self.assertTrue(d.passed)
        self.assertFalse(d.auto_merge_eligible)


class Tests(unittest.TestCase):
    def test_new_test_file_from_agent_auto_merges(self):
        d = decide([F("src/lib/filters.test.ts", "added", patch="+it('x', () => {})")])
        self.assertTrue(d.auto_merge_eligible)

    def test_modified_test_needs_owner(self):
        d = decide([F("src/lib/filters.test.ts", "modified", patch="+x")])
        self.assertFalse(d.passed)

    def test_added_skip_needs_owner(self):
        d = decide([F("src/lib/new.test.ts", "added", patch="+it.skip('x', () => {})")])
        self.assertFalse(d.passed)

    def test_ts_ignore_needs_owner(self):
        d = decide([F("src/lib/x.ts", "modified", patch="+// @ts-ignore")], approved=False)
        self.assertFalse(d.passed)

    def test_owner_approval_unblocks_agent_code(self):
        d = decide([F("src/App.svelte", "modified", patch="+<p>hi</p>")], approved=True)
        self.assertTrue(d.passed)


class OwnerApproval(unittest.TestCase):
    def test_latest_approval_on_head(self):
        reviews = [
            {"user": {"login": OWNER}, "state": "CHANGES_REQUESTED", "commit_id": "a"},
            {"user": {"login": OWNER}, "state": "APPROVED", "commit_id": "b"},
        ]
        self.assertTrue(qo_ci.owner_approved(reviews, OWNER, "b"))
        self.assertFalse(qo_ci.owner_approved(reviews, OWNER, "c"))

    def test_other_users_do_not_count(self):
        reviews = [{"user": {"login": "someone"}, "state": "APPROVED", "commit_id": "b"}]
        self.assertFalse(qo_ci.owner_approved(reviews, OWNER, "b"))


class Deps(unittest.TestCase):
    def test_allowlist_covers_package_json(self):
        import json

        pkg = json.loads((qo_ci.ROOT / "package.json").read_text())
        allowed = qo_ci.read_allowlist(qo_ci.ROOT / POLICY["dependency_allowlist_file"])
        self.assertEqual(sorted(qo_ci.direct_dependencies(pkg) - allowed), [])

    def test_lockfile_staleness(self):
        pkg = {"dependencies": {"a": "1", "b": "1"}}
        lock = {"packages": {"": {"dependencies": {"a": "1"}}}}
        self.assertEqual(qo_ci.lockfile_matches(pkg, lock), ["b"])


if __name__ == "__main__":
    unittest.main()
