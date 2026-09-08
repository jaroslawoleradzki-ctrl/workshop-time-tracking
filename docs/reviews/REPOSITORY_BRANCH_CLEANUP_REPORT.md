# Repository Branch Cleanup Report

Date: 2026-09-06
Repository: Workshop Time Tracking

## Scope and safety constraints

- Cleanup target: `main`, `development`, `demo`.
- Temporary protected branch: `feature/v0.5.2-production-followup`.
- The protected branch and its worktree were inspected only. No checkout, merge,
  rebase, cherry-pick, push, upstream change, deletion, or worktree removal was
  performed for it.
- `main` was not modified, merged into, or released.
- `development` was not modified with code or history.

The initial configured SSH fetch failed because the host rejected the permissions
of `/etc/ssh/ssh_config.d/20-systemd-ssh-proxy.conf`. Remote refs were then
refreshed successfully with an explicit HTTPS fetch, without changing the
repository's configured remote URL.

## Reference state before cleanup

| Branch | SHA before |
|---|---|
| `main` | `3fedd54f0367189e40b4fc3079c52c0202ff6c93` |
| `development` | `3fedd54f0367189e40b4fc3079c52c0202ff6c93` |
| `demo` | `7e10a45312ea295455d385cd7c742776cfe47556` |

The working tree used for the audit was clean on `development`.

## Complete branch audit

| Branch | HEAD before | Classification | Unique commits | Action | Integrated into development? | Deleted remote? | Deleted local? | Notes |
|---|---|---|---|---|---|---|---|---|
| `main` | `3fedd54f0367189e40b4fc3079c52c0202ff6c93` | PROTECTED | none | preserved | n/a | no | no | Production v0.5.1; untouched. |
| `development` | `3fedd54f0367189e40b4fc3079c52c0202ff6c93` | PROTECTED TARGET | n/a | preserved | n/a | no | no | Cleanup integration target; no code changes required. |
| `demo` | `7e10a45312ea295455d385cd7c742776cfe47556` | PROTECTED | `7e10a45`, `35fdade`, `aaed6b1`, `5e07c3b` relative to development | preserved | no; intentionally separate | no | no local branch existed | Demo has its own deterministic seed/branding history and is not identical to development. |
| `feature/v0.5.2-production-followup` | `69fa4008f51e8b3cfe9b54f98a7ecd6979c4da06` | ACTIVE — EXCLUDED FROM CLEANUP | `afcc6f4`, `9759ef0`, `a9dd790`, `d8c5cb3`, `1242c66`, `c3337c5`, `10d8c78`, `69fa400` | preserved | no | no | no | Active OpenCode worktree; explicitly excluded. Local upstream currently shows `origin/development`; it was not changed. |
| `feature/control-sums` | `e69a7197e04d65afa04bda5e7201d3cfd38fc544` | FULLY MERGED | none (HEAD is ancestor of development) | deleted after verification | yes | yes | yes | Clean worktree removed without force; all branch content is in development. |
| `feature/work-calendar` | `5b10f75501029d8aac8ffd4c928d910dd443df1f` | FULLY MERGED | none (HEAD is ancestor of development) | deleted after verification | yes | yes | yes | Clean worktree removed without force; all branch content is in development. |
| `temp/homelab-integration` | `bed8b66dc9c758e9c149775f2709b1f666cbe8b3` | FULLY MERGED | none (HEAD is ancestor of development) | deleted after verification | yes | n/a (no remote branch) | yes | Clean worktree removed without force; Portainer compatibility is in development. |
| `chore/homelab-dev-compose` | `e3ba48f85216e99f49eb78aa92bb70201fb305c8` | SUPERSEDED / PATCH-EQUIVALENT | `e3ba48f` topologically unique | deleted after verification | yes, patch-equivalent | yes | yes | `git patch-id --stable` matches `be2e75f` in development (`f1edc6815fa0262bf3ec8de3386a6b7afe53f69c`). The final development tree also contains the later Portainer fix `bed8b66`. |

For every deleted branch, the post-refresh recheck against the then-current
`origin/development` confirmed either direct ancestry or patch-equivalence. No
branch was removed based only on its name.

## Merge-base and diff evidence

- `feature/control-sums`: merge-base = `e69a719`; `git merge-base --is-ancestor`
  succeeded; branch-only log is empty.
- `feature/work-calendar`: merge-base = `5b10f75`; ancestry check succeeded;
  branch-only log is empty.
- `temp/homelab-integration`: merge-base = `bed8b66`; ancestry check succeeded;
  branch-only log is empty.
- `chore/homelab-dev-compose`: merge-base = `9061495`; one topological branch-only
  commit (`e3ba48f`), but its stable patch-id equals `be2e75f` already in
  development. Its added compose file is therefore superseded, not unique.
- `demo`: neither `demo` nor `development` is an ancestor of the other; it was
  preserved as required.

## Integration and recovered changes

No new commit was added to `development`; no cherry-pick or merge was required.
The previously integrated source commits relevant to the removed branches are:

| Source branch | Existing development commit(s) | Integration evidence |
|---|---|---|
| `feature/control-sums` | `e69a719` | HEAD is an ancestor of development |
| `feature/work-calendar` | `5b10f75`, `036fcee`, `6e0c5a5` | HEAD is an ancestor of development |
| `temp/homelab-integration` | `bed8b66` and its parent history | HEAD is an ancestor of development |
| `chore/homelab-dev-compose` | `be2e75f` | stable patch-id equality; later `bed8b66` is also in development |

Changes recovered into development during this cleanup: none (they were already
integrated before the audit).

## Worktrees found

| Path | Branch | Status | Cleanup result |
|---|---|---|---|
| `/home/cloud/dev/workshop-time-tracking` | `development` | clean | retained |
| `/home/cloud/dev/workshop-time-tracking-v0.5.2-production-followup` | `feature/v0.5.2-production-followup` | clean, ahead 8 of its displayed upstream | retained; protected |
| `/home/cloud/dev/wtt-control-sums` | `feature/control-sums` | clean | removed without `--force` after branch verification |
| `/home/cloud/dev/wtt-homelab-compose` | `chore/homelab-dev-compose` | clean | removed without `--force` after patch-equivalence verification |
| `/home/cloud/dev/wtt-integration` | `temp/homelab-integration` | clean | removed without `--force` after branch verification |
| `/home/cloud/dev/wtt-work-calendar` | `feature/work-calendar` | clean | removed without `--force` after branch verification |

## Tests and validation

`development` was not modified, so the project test/build suite was not rerun as
an integration gate. Existing project verification recorded in `PROJECT_STATUS.md`
and `CHANGELOG.md` reports passing backend tests/build/Prisma validation and
frontend tests/lint/build for v0.5.1. Git-only validation performed here:

- working tree clean before destructive ref/worktree operations: PASS;
- branch ancestry and merge-base audit: PASS;
- patch-id equivalence for `chore/homelab-dev-compose`: PASS;
- no force push, force branch deletion, reset, rebase, or release operation: PASS.

## Cleanup results

Remote branches deleted:

- `origin/chore/homelab-dev-compose`
- `origin/feature/control-sums`
- `origin/feature/work-calendar`

Local branches deleted:

- `chore/homelab-dev-compose`
- `feature/control-sums`
- `feature/work-calendar`
- `temp/homelab-integration`

Branches intentionally preserved:

- `main` — production v0.5.1.
- `development` — permanent integration target.
- `demo` — permanent demo branch with intentionally separate history.
- `feature/v0.5.2-production-followup` — active OpenCode worktree, excluded by instruction.

`development` was not modified, so its SHA is unchanged. This report is left as
the requested working-tree report; no commit was created because the repository
instructions prohibit creating a commit without an explicitly approved commit
message, and no code/history change to development required a report commit.

## Final reference SHAs

| Branch | SHA after |
|---|---|
| `main` | `3fedd54f0367189e40b4fc3079c52c0202ff6c93` |
| `development` | `3fedd54f0367189e40b4fc3079c52c0202ff6c93` |
| `demo` | `7e10a45312ea295455d385cd7c742776cfe47556` |

## Final Git state

Final `git branch -r`:

```text
origin/HEAD -> origin/main
origin/demo
origin/development
origin/feature/v0.5.2-production-followup
origin/main
```

Final `git worktree list`:

```text
/home/cloud/dev/workshop-time-tracking                            3fedd54 [development]
/home/cloud/dev/workshop-time-tracking-v0.5.2-production-followup 69fa400 [feature/v0.5.2-production-followup]
```
