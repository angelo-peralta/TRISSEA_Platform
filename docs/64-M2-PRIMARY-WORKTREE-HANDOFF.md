# M2 — Primary project folder handoff

> Environment setup update (Task 5A): use [the canonical configuration guide](65-ENVIRONMENT-CONSOLIDATION.md). Legacy dotenv names/commands below are historical acceptance evidence, not current setup instructions. The approved root-file cleanup is complete. [ADR 66](66-ADR-DEVELOPMENT-INFRASTRUCTURE.md) now defines the single canonical Docker stack; the runtime inventory and Git status below are historical.

Status: **COMPLETE — LOCAL WORKTREE CONSOLIDATION**, 2026-11-09.
M2 remains **COMPLETE — LOCAL/SIMULATED ENGINEERING ACCEPTANCE**, pending owner
review and the external gates recorded in [M2.7 acceptance](63-M2-INTEGRATION-SECURITY-ACCEPTANCE.md).
This handoff adds no milestone features or production approval.

## Current development location

Use `C:\Users\apera\Projects\TRISSEA_Platform` on
`test/m2-security-acceptance`. HEAD remains
`47a57c4314fafe6478802e0553da991be26e93b5`; the M2.7 implementation and evidence
remain uncommitted. The original `docs/m2-implementation-plan` branch still points
to `4249df0d52c84d7415ec17bf500c9d6c7e94ffd9`.

`TRISSEA_Platform_m2_identity` is retained as a detached linked worktree at the same
HEAD. Its 97 dirty files are unchanged. It is no longer the active M2 branch
checkout. No repository, remote, Git identity or history was recreated or rewritten.

## Preservation and transfer

Before changing checkouts, byte-verified snapshots of both dirty worktrees were
saved under the ignored local directory:

`.cache/worktree-consolidation/2026-11-09T03-39-08-467Z/`

- All 216 original modified/untracked files were accounted for. 214 remain
  byte-identical, either in place or in the preserved draft archive. The other two
  were deliberately reconciled: `.env.example` retains the exact original SMS
  planning block alongside the M2 configuration, and the M2 decision register
  already contains the original planning additions.
- Five unapproved earlier drafts, documents 51–55, are preserved byte-for-byte
  under `displaced/docs/` in that backup. The primary folder now contains the
  owner-approved M2 versions, including Keycloak instead of provisional Supabase.
- The current original `AGENTS.md`, project skills, Expo type declarations,
  canonical Git policy, M1 evidence and other unrelated files were preserved.
- 96 M2.7 changed/new files were transferred. The sibling's preexisting untracked
  legacy Git-policy document was retained there and excluded from the transfer.
- Missing ignored local configuration and required generated key/import files
  were carried over without exposing values. M1 `.env` and `.env.m1.local` hashes
  are unchanged. Private configuration, keys, caches and APKs remain ignored.
- The two previously accepted x86_64 APKs were reused with matching SHA-256 hashes.
  The primary folder's previous APKs were archived under `original-binaries/`
  before replacement. Generated native projects were not copied or rebuilt.

The sibling was detached with `git switch --detach HEAD`. In the primary folder,
`git switch --merge test/m2-security-acceptance` carried the tracked local changes.
The two overlapping files were reviewed, resolved and immediately unstaged. The
final index has no staged or unmerged files. No commit or publication was made.

## Verification from the primary folder

Actual command results are in the [validation record](../evidence/m2/primary-worktree/validation-results.json).
Raw command logs and preservation manifests remain in the ignored backup above.

| Command/check | Observed result |
| --- | --- |
| `pnpm.cmd install --frozen-lockfile` | Exit 0; existing reviewed lockfile used |
| `pnpm.cmd validate` | Exit 0; 138 tests, contract parity, lint, strict TypeScript, API/admin builds |
| `pnpm.cmd mobile:check` | Exit 0; both apps' dependencies current |
| `pnpm.cmd mobile:doctor` | Exit 0; 21/21 checks for each app |
| `pnpm.cmd mobile:export` | Exit 0; both apps exported |
| `pnpm.cmd audit:dependencies` | Exit 0; no known vulnerabilities reported |
| `pnpm.cmd test:m2:integration` | Exit 0; 8 combined HTTP/controller tests |
| `pnpm.cmd test:m2:browser` | Final exit 0; 5 actual Playwright/Keycloak tests |
| `pnpm.cmd passenger:prepare`, `driver:prepare`, `admin:prepare` | Each exit 0; new empty disposable databases only |
| Three API startup/database checks | Each passed; non-owner connection, no RLS bypass, verified disposable manifest, health 200, unauthenticated request 401 |
| Preservation and Git checks | Original/source hashes verified; original branch unchanged; empty index; `git diff --check` passed |

The initial browser run failed at application-session readiness after the
password/TOTP redirect; four later tests consequently failed. Restarting the
tmpfs-backed Keycloak database required the existing post-import configuration
step, `pnpm.cmd keycloak:provision`. It configured the password/TOTP flow and
read-only assurance client without creating TRISSEA grants. The complete browser
rerun then passed 5/5. No authentication policy, test assertion or application
code was weakened. The [failed attempt](../evidence/m2/primary-worktree/browser-first-attempt-results.json)
and [successful rerun](../evidence/m2/primary-worktree/browser-results.json) are both retained.

All four M2 containers were initially stopped. Only those existing containers
were started with `docker start`; they were then healthy. PostgreSQL/PostGIS on
15433 accepted connections and Redis on 16380 returned `PONG`. Combined tests
created a fresh shared disposable database, applied seven migrations and verified
the unrelated sentinel and migration ledger. See the [HTTP results](../evidence/m2/primary-worktree/integration-results.json).
No database, volume or existing records were deleted, and M1 ports 15432/16379
were not used.

The three copied standalone development configurations referred to databases
absent after the stopped tmpfs cluster. After verifying each database was absent,
those private configurations were archived under `prior-local-config/`. Existing
prepare scripts created fresh isolated slice fixtures through migrations 0004,
0005 and 0006 respectively. No existing database was migrated or replaced, no
application users/grants were seeded, and previous keys/configuration remain
archived. These fixtures are separate test environments; the combined acceptance
run verifies all modules against one database. The [startup results](../evidence/m2/primary-worktree/api-smoke-results.json)
also confirm bookings remain disabled. Owned API/Vite smoke-test processes exited.

## Evidence and limits

Five new browser screenshots were visually inspected with masked inputs and
synthetic records only: [assigned driver](../evidence/m2/primary-worktree/assigned-driver-desktop.png),
[mobile membership](../evidence/m2/primary-worktree/membership-mobile.png),
[restricted role](../evidence/m2/primary-worktree/restricted-role.png),
[revoked access](../evidence/m2/primary-worktree/revoked-access.png) and
[mobile keyboard/access denial](../evidence/m2/primary-worktree/verification-mobile-access-denied.png).
The browser tests verify TOTP, scoped review, retry/idempotency, CSRF denial,
revoked grants, HttpOnly/SameSite cookies, empty browser token storage and zero
page exceptions.

Android emulator acceptance was not rerun for this relocation. The actual prior
[30-checkpoint run](../evidence/m2/m2-7/android-results.json), screenshots and APK
hashes are preserved. This is not new physical-device, iOS, TalkBack or live-SMS
acceptance.

Running Keycloak/Postgres containers still use the preserved sibling's generated
bind-mount paths. Matching files exist in the primary folder, but containers were
not recreated to change mounts. Retain the sibling until a separately reviewed
local infrastructure transition; it must not be deleted as cleanup.

Gates A–E remain closed. No live SMS, real documents, operational driver approval,
recovery, public deployment or M3 work was enabled. The working tree contains both
M2 work and preserved original changes; review explicit task paths before any
future staging. No new commit, push, PR, merge or deployment was performed.
