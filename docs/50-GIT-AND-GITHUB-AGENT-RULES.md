# TRISSEA — Git & GitHub Agent Rules

**Repository:** `https://github.com/angelo-peralta/TRISSEA_Platform.git`

**Default/protected target branch:** `main` (treat as protected regardless of GitHub configuration)
**Scope:** All coding agents (Codex, Claude Code, Copilot, Cursor) working on TRISSEA.

**Priority:** These rules supplement `AGENTS.md`. They never override platform safety instructions, user approvals, or repository protections.

## 1. Authority and approvals

| Operation | Agent policy |
| --- | --- |
| Read status/diff/log, inspect branches/remotes, run tests | Allowed |
| `git fetch origin` | Allowed |
| `git pull --ff-only` | Allowed **only** after verifying the current branch, clean working tree, and expected upstream |
| Create or switch to a new feature branch | Allowed for a clearly assigned task, provided doing so does not disturb uncommitted changes |
| Stage and commit task-scoped changes | Allowed after checking diff, tests, `.gitignore`, and secrets; no unrelated files |
| Push an agent-owned feature branch | Require explicit user authorization to publish that task (authorization may cover the branch + draft PR together) |
| Open a draft PR to `main` | Allowed once push/PR publication has been authorized; record incomplete checks clearly |
| Mark PR ready for review | Allowed only after tests, security review, and acceptance criteria have passed, and user has requested review readiness |
| Merge PR, close PR, delete remote branch | Require explicit user approval |
| Push to `main` or another protected branch | **Never** do this directly; use PRs |
| Change remotes, account/author identity, credentials, safe.directory or branch protection | Require explicit user approval |
| Force push, history rewrite, destructive cleanup/reset | Require specific, explicit approval for exact operation and target |

**No silent publication:** A user request to write code is not by itself permission to push, create a PR, or merge. Local commits are allowed unless the user asks the agent not to commit. Never falsely report a remote push or PR as completed.

## 2. Before editing anything

1. From the project root, read `AGENTS.md` and this policy.
2. Confirm `git remote get-url origin` points to `angelo-peralta/TRISSEA_Platform` (HTTPS or equivalent SSH remote). Do not change it silently.
3. Run `git status --short --branch`, `git branch --show-current`, and `git log -1 --oneline`.
4. Preserve existing uncommitted work. Never discard, stash, auto-commit, or overwrite changes made by the user or another agent without authorization.
5. Scope one work item per branch; do not mix fare-policy, privacy, database, dispatch, and UI work into unrelated changes.

## 3. Branch conventions

Branch prefixes: `feat/`, `fix/`, `docs/`, `refactor/`, `test/`, `chore/`, `hotfix/`.

Examples: `feat/regular-booking`, `fix/driver-offer-race`, `docs/toda-fare-policy`.

- Branch from an up-to-date `main` *only* when the working tree is clean and fast-forward is safe.
- Reuse the existing task branch if one exists; do not create duplicate branches automatically.
- Never directly develop on `main`, except explicitly authorized emergency maintenance managed by the owner.

## 4. Changes, tests, and commits

- Run tests, lint, and type checks appropriate for the changed packages. Report any that cannot run.
- For changes to booking state, dispatch, fare policies, identity, privacy, or migrations, include regression and permission tests.
- Inspect `git diff --check`, `git diff`, and `git diff --cached` before committing.
- Stage only task-related paths (`git add <specific paths>`). Avoid blanket `git add .` when unrelated or generated files exist.
- Never commit `.env`, credentials, tokens, secret keys, user identity documents, passenger location records, production database exports, or large generated build artifacts.
- Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.
- Do not bypass commit hooks or claim tests passed when they did not.
- Never amend or rewrite someone else's published commits without authorization.

## 5. Push rules

After explicit authorization:

1. Verify the exact remote with `git remote -v` and the intended current branch with `git branch --show-current`.
2. Ensure the working tree is clean or report pending work.
3. Ensure the branch is not `main` and no secrets are staged or committed.
4. Use `git push -u origin <branch-name>` for initial publication or `git push origin <branch-name>` for later updates.
5. Never push with `--force` or `--force-with-lease` without explicit approval.
6. Report the pushed branch and remote URL; stop and report if authentication, protected-branch, or divergence errors occur.

## 6. Pull request rules

After authorization to publish:

- Prefer a **draft PR** first, targeting `main` from the task branch.
- PR title: conventional format, e.g., `feat: implement regular ride booking flow`.
- PR body must contain: Summary, Scope, Linked issue (if any), Screenshots/video for UI changes (if available), Tests run and results, Database migrations/rollback notes, Security/privacy impact, Fare/TODA policy impact, Known limitations, Review checklist.
- Never assert that city/TODA fare authorization, mobile GPS reliability, or privacy compliance was approved unless documented evidence exists.
- Keep draft status for unfinished features, failing tests, pending migrations, or open policy decisions.
- Resolve review feedback in the same branch and update the PR, without rewriting shared history.
- Never self-approve or auto-merge a PR involving fares, payments, personal data, roles, driver eligibility, or dispatch transactions.

## 7. Pull request merge rules

- Merges require explicit user authorization for the specific PR.
- Confirm target is `main`, required checks are green, reviewers have approved where required, and unresolved comments have been addressed.
- Prefer squash merge for a single-feature PR if the repository supports it; do not assume a merge method is already configured.
- Never bypass repository branch protection.
- After merge, report PR URL, merged commit, and outstanding deployment steps. Delete branches only if separately authorized.

## 8. Prohibited without specific approval

`git reset --hard`, `git clean -fd` / `-fdx`, `git checkout -- <paths>` to discard changes, `git restore` to discard work, `git branch -D`, `git push --force`, `git push --force-with-lease`, rebasing a published shared branch, changing remote URLs, changing local/global Git identity, and adding `safe.directory` exceptions.

If Git reports `dubious ownership`, report the exact repo and owner mismatch and obtain permission before modifying Git's trusted-directory configuration. Do not use `safe.directory '*'`.

## 9. Standard Windows PowerShell workflow (illustrative; run only when authorized)

```powershell
# Check repository first
git status --short --branch
git remote get-url origin
git branch --show-current

# Start a task from a clean, fast-forwardable main
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c feat/regular-booking

# Work, validate, and inspect changes
pnpm lint
pnpm test
git diff --check
git status --short
git add apps/passenger apps/api
git diff --cached
git commit -m "feat: implement regular booking workflow"

# Only AFTER explicit permission to publish this feature branch
git push -u origin feat/regular-booking

# Only AFTER authorization to open a PR; GitHub CLI must be installed/authenticated
gh pr create --draft --base main --head feat/regular-booking --title "feat: implement regular booking workflow" --body-file .github/PR_DESCRIPTION.md

# Check without merging
gh pr status
gh pr checks
```

The sample PR body path is illustrative: generate a task-specific Markdown description or use `gh pr create --fill` if no PR body file exists. The `pnpm` commands must match the actual workspace scripts. Do not run these commands as a blind script; follow the authorization and safety gates above.

## 10. Completion report for each task

State: branch name, modified paths, tests passed/failed, commit hash (if any), whether push was authorized and completed, PR URL (if any), migrations/risks, and any action requiring owner approval. Do not claim success until Git/GitHub actually confirms it.
