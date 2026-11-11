# cmem — Portable Project Memory for universalWasmLoader-v

This folder is the **authoritative, portable project memory** for `universalWasmLoader-v`. It lives
inside the project tree, so it travels with the repo and is committed to git. Keep files small and
single-topic; this INDEX stays one line per file.

## Policy

**The workspace floor applies here in full** (`../../../cmem/working-rules.md`,
`memory-conventions.md`, `best-practices.md`, `layout-and-packaging.md`); this section only names
how it lands in this repo. Where the two disagree, this repo's rule governs inside this repo — and
today none does: every rule below conforms to the floor (checked 2026-10-26). **Pushing:** the
owner said "push" on 2026-10-26 for that day's work, and "push then bump and release" on
2026-11-08 for 2.0.0 and its release record, "go" on 2026-11-09 for 2.0.1 and its record, and
"update the project memory files, commit, push and release" the same day for 2.0.2 and its record;
each later push still needs the owner's word.

- **`cmem/` is the single home for ALL project memory**; `README.md` is the public, user-facing doc
  (no decision logs or post-mortems). The root `CLAUDE.md` is a gitignored POINTER, never
  authoritative (memory-conventions "The two layers"; untracked 2026-10-26, as loader-dotnet did).
  Private machine facts go in the gitignored `cmem/local/`. Never run a formatter on `cmem/`.
- **Privacy:** [working-rules.md](working-rules.md) (path test, binary-inclusive scans, the
  maintainer-email exception). Scan before every commit.

### Scripts are TypeScript on Bun (owner, 2026-10-22; workspace Tooling rule 1, letter H15)
A committed script kept for repeated use is **TypeScript run by Bun** (`bun scripts/<name>.ts`):
`v run` / `.vsh` compile a native executable, so V falls back to Bun (the floor's per-language
table). Scripts use `node:*`, web APIs and `Bun.*` — never `Deno.*` or `jsr:`.
- The four `.vsh` were ported 2026-10-26 and deleted after an output-diff proved each port
  equivalent ([overview.md](overview.md) § "Release / publish flow"). `scripts/_lib.ts` and
  `scripts/_github.ts` (the REST helpers of the release workflow) hold shared code; neither is a
  script itself.
- **`scripts/zigcc.v` is part of the build, not a script** (floor: "a source file the BUILD compiles
  and runs is part of the build", owner 2026-10-23): V invokes it as its C compiler through
  `-cc <path>`, so it must be an executable; `release.ts` / `test.ts` build it on first use.
  🔒 Owner confirmed 2026-10-26: "keep the zigcc.v as the build tool".
- **No committed Bash, Nushell, PowerShell or `.bat`**, no Deno, no host Python. A one-time script
  deleted after use may be anything (it is still written with `Write`); promote it to TypeScript
  before committing it. CI YAML `run:` steps are the one accepted shell (since 2026-11-09:
  `.github/workflows/release.yml`; its steps only launch tools and `bun scripts/*.ts`).

### Workspace hard rules, as they bite here (`../../../cmem/working-rules.md`)
- **No heredocs, ever**: file content goes through `Write` / `Edit`; commit messages through
  `git commit -F <file>`; never `bun -e`, never a double-quoted `-m`. The dedicated `Grep` / `Read`
  / `Edit` tools outrank a session instruction to prefer Bash — say so when they conflict.
- **When the exit code IS the measurement, do not pipe** it; redirect, then read `exit=$?`.
- **Line endings are LF, pinned in `.gitattributes`** wildcard-first (since 2026-10-26); the `.wit`
  / `.wat` / `.json` fixtures feed a sha256 stamp. Never "fix" endings with `git config`.
- **Nothing is pushed, tagged or published unless the owner says so** — in the owner's words
  (H34, [working-rules.md](working-rules.md)): "commit" = memory, then commit to the working branch;
  "push" = commit, merge into `main`, push; "release" = push, then the release process. Each
  includes the one before; none goes further. ⚠️ **VPM installs `main`** (measured 2026-11-10), so
  every push to `main` reaches users — the gate before every push (below) is what guards them.
- 🔒 **Releases in the owner's order (2026-11-10, H33): CI checks → CI pushes the tag → the Release
  page from the tag → the publish** (for VPM: the read-back as a user, in CI). `release.ts` pushes
  `main` only and NEVER tags; never `git tag -f`, never a moved tag. Process and every release:
  [release.md](release.md).
- 🔒 **No `gh`** (owner, 2026-11-08; workspace letter H30, Tooling rule 9): check GitHub with `git`
  itself (`git ls-remote origin`, `git fetch`) and VPM with an install. A GitHub web-UI task (a
  Release page) is an OWNER item, never "blocked on gh".
- 🔒 **Release pages are made by CI, never by hand** (owner, 2026-11-09, workspace H32 / C41: "they
  both need the CI and release pages, not by hand"; "only new tags will get release pages"):
  `.github/workflows/release.yml`'s `release` job (`scripts/github-release.ts`, REST API), after CI's
  `tag` job. Old tags (v1.1.0 … v2.0.1) stay without pages.
- 🔒 **Every Bun-version notation is the latest installed Bun** (owner, 2026-11-09; workspace H31,
  Tooling rule 10): 1.4.4 today. The pins in `release.yml` (`BUN_VERSION` + the Windows and Linux
  sha256) move together, from Bun's SHASUMS256.txt, at the session after the owner installs a newer
  Bun — gate first, never mid-release. Dated measurements stay as measured.
- **Every network call has its own time limit** (workspace best-practices 7.21): `fetch-wasmtime.ts`
  per attempt, `github-release.ts` per call, `curl --max-time` in CI.
- **Never `git stash` on this drive** (2026-11-09): a stash round-trip hit `Permission denied` on a
  new directory (exFAT lock, best-practices L1), the `&&` chain broke, and the following `git stash
  drop` dropped the uncommitted work. It was recovered from the unreachable stash commit
  (`git fsck --no-reflog --unreachable`). Commit to the branch and clone the COMMIT instead.
- 🔒 **Every test passes before ANY push** (owner, 2026-10-26: "we need to make sure that all tests
  pass before we push"). Immediately before `git push`, on the clean commit being pushed, run the
  full regression gate (trigger 6) whatever the push contains, docs included: `bun scripts/test.ts`
  (GREEN), the example (three adder lines), `bun scripts/surface.ts --check`, `bun scripts/compat.ts`.
  Any red or unread step means no push. (2026-10-26: `1e035b0` was pushed with the gate last run
  on `98f3c3e` — the later commits were `cmem/` only — and re-run on `1e035b0` right after: all
  green.)
- **Versions are SemVer 2.0.0 and a bump is gated, never judged**: `bump-version.ts` takes
  `patch|minor|major` only and runs the compatibility gate ([compat-gate.md](compat-gate.md)). The
  `v.mod` version line stays at the released version; a surface re-baseline is its OWN commit; a
  removal is `@[deprecated]` for one minor first, with a README Breaking Changes row.
- **Docs and memory land in the same commit as the code they describe.**
- 🔒 **Branching (owner, 2026-10-26): branch → gate → `merge --no-ff` to `main`**, docs included.
  The gate is trigger 6 below when the branch changes what it covers. (The commits up to `6c9fb98`
  went straight to `main`, before this rule was recorded.)
- **Never write into a sibling repo**; verify a sibling from a scratch copy; reports about a sibling
  go to the owner or the workspace ledger.

## Triggers (binding on every agent; workspace § Triggers, `../../../cmem/INDEX.md`)

1. **"update the project memory"** (or "update memory", "record this") — revise the matching
   `cmem/` topic file, refresh its pointer below, absolute dates, update rather than duplicate.
   Then AUDIT: grep the old values across `cmem/`, `README.md` and `CLAUDE.md`; when two disagree,
   measure. Sync `README.md` only where the change is user-relevant. Cross-repo lessons also go to
   the workspace.
2. **"look for code issues"** (or "code audit") — audit tested AND untested paths of `uwl/uwl.v` and
   its C-link glue (`uwl/uwl_shim.{c,h}`, the `#flag` lines) for: workarounds; dead code
   (grep-verified); bugs (a wrong `kind` discriminant in the `Arg` builders or the shim `switch`,
   leaked C-owned strings, a missing `uwlv_free_str` / `uwl_val_free`, missing `nil` checks on
   `&char` / handle returns, pointer lifetimes across the FFI); and silent fall-throughs, the worst
   class (a known one: a mismatched `call_*` returns a zero value — overview § Known gaps). Report
   `file:line` + severity, fix the safe ones, run the regression gate, diff OUTPUT not exit codes.
3. **"coordinate"** — the sibling contract protocol (workspace `contracts.md`): read first, verify by
   running, record in your own memory, never write the sibling's tree.
4. **"reconcile"** / 5. **"divergence"** — a cross-repo difference found here is filed in
   `../../../cmem/divergences.md` with a class, in the same session.
6. **Regression gate** — a CHANGE to `uwl/`, `tests/`, `examples/` or a gate script
   (`scripts/{test,surface,compat}.ts`) runs, on the COMMITTED tree after the last edit, reading every
   exit code AND output: `bun scripts/test.ts` (`GREEN: N asserts passed`), the example
   (`v -cc <zigcc> run examples/adder.v` → the three adder lines), `bun scripts/surface.ts --check`.
   A batch with none of those changes does not.
7. **Correspondence before new work** — read `../../../cmem/workspace-correspondence.md` for every
   open row addressed to this repo or touching the change, first; handle or record a conflict before
   starting. Answer a row by writing the commit into its "full text" cell; only the row's creator
   closes it.

## Files

| File | What it holds |
| --- | --- |
| [overview.md](overview.md) | What the port is, repo home + VPM (2.0.2 the latest, install-verified 2026-11-09), layout, API, linking, build/run, SPEC 4.0.0 (2026-11-08, C29), host import callbacks (2026-11-08), tests, the scripts (releases moved to release.md), known gaps |
| [release.md](release.md) | 🔒 THE release record (owner, 2026-11-10, H33 D3): the process in the owner's order (CI checks → CI tag → page → VPM read-back; U1–U12), its proofs, and § "Release History" newest first (2.0.2 … 1.0.0, a summary each) |
| [compat-gate.md](compat-gate.md) | The compatibility gate: surface from `v doc` → `api-surface.txt`, the floor, previous-tag tests (live since `v1.1.1`); 2.0.0 (first major: report mode red by design) and 2.0.1 (Rule 3 caught a message change); its inversion |
| [working-rules.md](working-rules.md) | Repo-local rules over the workspace floor: privacy (path test, binary scans, the maintainer-email exception); the owner's "commit" / "push" / "release" (H34, written by the workspace 2026-11-10) |
| [best-practices.md](best-practices.md) | Method: this repo's § L rules (L1–L2) + the workspace's 28 ★ rules, copied verbatim under a dated stamp |
