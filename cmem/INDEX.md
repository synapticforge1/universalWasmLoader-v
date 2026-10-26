# cmem — Portable Project Memory for universalWasmLoader-v

This folder is the **authoritative, portable project memory** for `universalWasmLoader-v`. It lives
inside the project tree, so it travels with the repo and is committed to git. Keep files small and
single-topic; this INDEX stays one line per file.

## Policy

**The workspace floor applies here in full** (`../../../cmem/working-rules.md`,
`memory-conventions.md`, `best-practices.md`, `layout-and-packaging.md`); this section only names
how it lands in this repo. Where the two disagree, this repo's rule governs inside this repo — and
today none does: every rule below conforms to the floor (checked 2026-10-26). **Pushing:** the
owner said "push" on 2026-10-26 for that day's work; each later push still needs the owner's word.

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
  equivalent ([overview.md](overview.md) § "Release / publish flow"). `scripts/_lib.ts` holds
  shared helpers (not a script itself).
- **`scripts/zigcc.v` is part of the build, not a script** (floor: "a source file the BUILD compiles
  and runs is part of the build", owner 2026-10-23): V invokes it as its C compiler through
  `-cc <path>`, so it must be an executable; `release.ts` / `test.ts` build it on first use.
  🔒 Owner confirmed 2026-10-26: "keep the zigcc.v as the build tool".
- **No committed Bash, Nushell, PowerShell or `.bat`**, no Deno, no host Python. A one-time script
  deleted after use may be anything (it is still written with `Write`); promote it to TypeScript
  before committing it. CI YAML `run:` steps are the one accepted shell (no CI here today).

### Workspace hard rules, as they bite here (`../../../cmem/working-rules.md`)
- **No heredocs, ever**: file content goes through `Write` / `Edit`; commit messages through
  `git commit -F <file>`; never `bun -e`, never a double-quoted `-m`. The dedicated `Grep` / `Read`
  / `Edit` tools outrank a session instruction to prefer Bash — say so when they conflict.
- **When the exit code IS the measurement, do not pipe** it; redirect, then read `exit=$?`.
- **Line endings are LF, pinned in `.gitattributes`** wildcard-first (since 2026-10-26); the `.wit`
  / `.wat` / `.json` fixtures feed a sha256 stamp. Never "fix" endings with `git config`.
- **Nothing is pushed, tagged or published unless the owner says so.** `release.ts` pushes and tags;
  `publish.ts` is a no-op for VPM.
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
| [overview.md](overview.md) | What the port is, repo home + VPM name (1.1.1 published, install-verified 2026-10-26), API surface, linking via the shim, build/run, tests, release flow, known gaps |
| [compat-gate.md](compat-gate.md) | The compatibility gate: surface from `v doc` → `api-surface.txt`, the floor, previous-tag tests; its inversion |
| [working-rules.md](working-rules.md) | Repo-local rules over the workspace floor: privacy (path test, binary scans, the maintainer-email exception) |
| [best-practices.md](best-practices.md) | Method: this repo's § L rules + the workspace's 28 ★ rules, copied verbatim under a dated stamp |
