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

### Scripts are V (owner, 2026-10-21; binding on every agent)
Every script in this repo is written in **V**. This applies the workspace floor
(`../../cmem/working-rules.md` "Tooling — hard rules" 1: Deno/TypeScript, plus the repo's own
language for in-tree tools) and picks V as the default here. Anyone building this repo already has V,
so no extra runtime is needed.
- **Scripts are V scripts (`.vsh`)** in `scripts/`, run with `v run scripts/<name>.vsh [args]`.
- **A tool that must be an executable** (for example the `zigcc` wrapper, which V calls through
  `-cc <path>`) is a small V program built to a binary, not a `.bat`/`.ps1`/`.sh` launcher.
- **No new Bash, Nushell, PowerShell or `.bat` scripts.** The existing `scripts/*.{sh,nu,ps1,bat}`
  are legacy and still due for migration. When a script is ported, the port is the **only** form and
  the old forms are deleted in the same commit. No dual forms to keep in parity.
- Only CI YAML `run:` steps may be shell (there is no CI here today). Ad-hoc probes in the session
  scratchpad may be `.vsh` or Deno `.ts`.

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

## Files

| File | What it holds |
| --- | --- |
| [overview.md](overview.md) | (Scripting rule: see Policy "Scripts are V"; legacy scripts pending migration.) What this V port is, its repo home (moved to the `synapticforge1` org, recorded 2026-10-21; VPM now `synapticforge1.uwl`, old `jrmarcum.uwl` listing still up), its language/runtime, API surface, how it links the C loader + wasmtime via the shim, build/run flow (verified output, re-verified on V 0.5.2 2026-10-21; `zigcc.ps1` raw-command-line fix), the release/publish toolchain, and known gaps |
