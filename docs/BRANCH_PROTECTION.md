# Protecting `main` and `develop`

GitHub **Free** does not allow branch protection on **private** repositories
(it needs GitHub Pro or higher). Since Shubayr is proprietary, keep it private.
You have two good options:

## Option A — Upgrade to GitHub Pro (recommended, enforced)
Once the owner account is on Pro, protect both `main` and `develop`
(Settings → Branches → Add rule) with:
- Require a pull request before merging (1 approval).
- Dismiss stale approvals on new commits.
- Require conversation resolution before merging.
- Require the **CI** status check to pass.
- Include administrators.
- Block force-pushes and deletions.

## Option B — Convention-based (free, not enforced by GitHub)
Until you upgrade, protect the branches by team agreement:
- **Nobody pushes to `main` or `develop` directly.** All work is a `feature/*`
  branch → Pull Request → review → merge.
- CI still runs on every PR (`.github/workflows/ci.yml`) and validates the DB
  schema, so broken schema changes are caught automatically.
- CODEOWNERS auto-requests the right reviewer on each PR.
- Merge only after CI is green and one review is done.

This gives you 90% of the safety at no cost; upgrade to Option A before the team
grows so the rules are enforced, not just agreed.
