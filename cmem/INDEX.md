# cmem — Portable Project Memory for universalWasmLoader-v

This folder is the **authoritative, portable project memory** for `universalWasmLoader-v`. It lives
inside the project tree, so it travels with the repo and is committed to git. Keep files small and
single-topic.

## Policy

- **`cmem/` is the single home for ALL project memory.** When the owner says "**update the project
  memory**," update the matching `cmem/` topic file with the latest decisions, found bugs, design
  changes, and current state — then add/refresh its one-line pointer in the table below. Convert
  relative dates to absolute; update existing entries rather than duplicating.
- **`README` is NOT project memory.** It is the public, user-facing doc. Keep internal decision logs /
  bug post-mortems out of it — those live here in `cmem/`.

### Scripts are TypeScript on Bun (owner, 2026-10-22; workspace letter H15; binding on every agent)
A committed script kept for repeated use is **TypeScript run by Bun** (`bun scripts/<name>.ts`).
Workspace Tooling rule 1 (`../../../cmem/working-rules.md`): a script uses the repo language's own
scripting mechanism unless that mechanism must BUILD AN EXECUTABLE to run it — `v run` and `.vsh`
compile a native executable, so V falls back to Bun.
- The four `.vsh` (bump-version, release, publish, fetch-wasmtime) were ported 2026-10-26 and
  deleted after an output-diff proved each port equivalent ([overview.md](overview.md) § "Release /
  publish flow"). Shared helpers live in `scripts/_lib.ts` (not a script itself).
- **A tool that must be an executable** stays a small V program built to a binary: `scripts/zigcc.v`,
  which V calls through `-cc <path>`, so it cannot be a script (a `.ts` file is not an executable,
  and a compiled Bun binary would be an executable too). Counted as a BUILD TOOL, not a script, the
  way the owner ruled wazmrt's `tools/*.zig` (2026-10-23). 🗓️ OWNER: confirm (recorded 2026-10-26).
- **No Bash, Nushell, PowerShell or `.bat` scripts**, no Deno, no Python. Each script has **one**
  form. A one-time script deleted after use may be anything, written with `Write`, never a heredoc.
- History: the shell scripts were ported to `.vsh` on 2026-10-21 under the earlier rule ("Scripts
  are V"); the owner's 2026-10-22 clarification retired that the next day.

### The "update the project memory" trigger (binding on every agent)
When the owner says **"update the project memory"** (or a synonym — "update memory", "record this"),
do BOTH: (1) revise all relevant `cmem/` files and refresh the Files-table pointers (absolute dates;
update, don't duplicate); and (2) sync the user-facing README only where the change is user-relevant —
never copy internal decision logs into it.

### The "look for code issues" trigger (binding on every agent)
When the owner says **"look for code issues"** (or "code audit" / "audit the code"), perform a
comprehensive audit of the V binding (`uwl/uwl.v`) and its C-link glue
(`uwl/uwl_shim.c`, `uwl_shim.h`, the `#flag` link lines in `uwl.v`) for: (1)
workarounds / temporary hacks; (2) dead code; (3) bugs (wrong `kind` discriminant in the `Arg`
builders or the shim `switch`, leaked C-owned strings, missing `uwlv_free_str`/`uwl_val_free`, missing
`nil` checks on `&char`/handle returns, unsafe pointer lifetimes across the FFI boundary); and (4)
silent fall-throughs (returning a default kind instead of erroring). Report `file:line` + severity, fix
the safe ones, and confirm the example still prints the expected adder output (see `overview.md` for
the exact build command and output).

### Workspace triggers (binding here; full text `../../../cmem/INDEX.md` § Triggers)
**Correspondence before new work** — read `../../../cmem/workspace-correspondence.md` for open rows
addressed to this repo or touching the change, first. **Divergence** — a cross-repo difference found
here is filed in `../../../cmem/divergences.md` with a class, in the same session.

## Files

| File | What it holds |
| --- | --- |
| [working-rules.md](working-rules.md) | Repo-local rules over the workspace floor: privacy (path test, binary scans, the maintainer-email exception) |
| [best-practices.md](best-practices.md) | Method: this repo's § L rules + the workspace's 28 ★ rules, copied verbatim under a dated stamp |
| [overview.md](overview.md) | (Scripting rule: see Policy; scripts are TypeScript on Bun since 2026-10-26, proved equivalent to the `.vsh` they replaced.) What this V port is, its repo home (moved to the `synapticforge1` org, recorded 2026-10-21; VPM now `synapticforge1.uwl`, old `jrmarcum.uwl` listing still up), its language/runtime, API surface, how it links the C loader + wasmtime via the shim, build/run flow (verified output, re-verified on V 0.5.2 2026-10-21; `zigcc.ps1` raw-command-line fix), the release/publish toolchain, and known gaps |
