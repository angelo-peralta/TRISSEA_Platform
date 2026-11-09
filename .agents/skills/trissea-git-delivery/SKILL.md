---
name: trissea-git-delivery
description: Safely handle TRISSEA feature branches, scoped commits, authorized GitHub pushes, draft pull requests, CI status, review feedback and release handoff. Use when performing Git or GitHub delivery actions; not for ordinary code edits with no publishing request.
---

# Git and GitHub delivery — safe, reviewable history

Follow `AGENTS.md` and `docs/50-GIT-AND-GITHUB-AGENT-RULES.md` if present. If the policy path is missing, report the broken reference and apply root prohibitions. Never infer permission to push/PR/merge from permission to implement code.

## Before editing or staging

1. Inspect `git status --short --branch`, `git branch --show-current`, `git remote get-url origin` and relevant history; confirm `angelo-peralta/TRISSEA_Platform` before remote actions.
2. Preserve unrelated modifications; no silent stash, hard reset, clean, discard, remote change, identity change or force push.
3. Use a task branch from an updated safe baseline, but don't switch into/out of a dirty worktree if doing so would interfere with user work.

## Deliver

- Confirm required checks passed for the final candidate using `docs/15-AGENT-WORKFLOW.md`: full implementation acceptance once, or documentation/link and applicable skill/configuration checks for documentation-only work. Do not repeat unchanged acceptance solely to stage or commit. Failed blocking security/correctness checks prevent publication; disclose unrun checks and reasons.
- Run `git diff --check`, inspect the complete diff and migration/security implications, then stage explicit task-related paths only. Inspect `git diff --cached`, secrets and generated artifacts before a conventional commit. Keep meaningful checkpoints for multi-feature milestones.
- For push or draft PR, require explicit authorization. Confirm branch is not `main`, remote is correct and history is not divergent before publishing. Never rewrite shared history.
- PR describes scope, performed tests with actual status, migration/backfill/rollback, security/privacy risk, unresolved policy, UI evidence if applicable and reviewer acceptance checklist. Create a draft PR for work still awaiting review.
- CI check statuses are observed, never assumed. Address requested reviews without broad unrelated refactoring.
- Merge, public deploy, delete remote branches or change protections only after distinct explicit owner approval. Don't silently enable auto-merge.

## Report

Branch, commit SHA if created, push result, PR URL if created, observed CI status, working tree remainder and unresolved acceptance gates. If an action failed or was not authorized, say so.
