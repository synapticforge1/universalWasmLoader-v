> **⚠️ PORTABLE PROJECT MEMORY LIVES IN `cmem/`** — start at [`cmem/INDEX.md`](cmem/INDEX.md).

> **At session start, read `../../cmem/handoffs.md` for letters addressed to this repo.** The workspace
> session (`../../cmem/INDEX.md`) reviews across the sibling repos and reports there; nothing is ever
> written into this repo from outside. (owner directive, 2026-09-20)

> When saving new project memory, write it into the matching `cmem/` topic file (and refresh its
> pointer in `cmem/INDEX.md`). The **"update the project memory"** and **"look for code issues"**
> triggers are defined in `cmem/INDEX.md` and are binding on every agent.

# universalWasmLoader-v

Repo home: **https://github.com/synapticforge1/universalWasmLoader-v** (moved from `jrmarcum`,
2026-10; see `cmem/overview.md` "Repository home").

Idiomatic V binding for the [Universal WASM Loader](https://github.com/synapticforge1/universalWasmLoader-c).
A thin wrapper over the C single-header loader (a small C shim + a V module): call `.wasm` exports with
native V values and `!`/`or` error handling. See [`README.md`](README.md) for user-facing docs and
[`cmem/overview.md`](cmem/overview.md) for the project memory.

## Quick orientation

- `uwl/uwl.v` — the binding (public `Module` API, `Arg` builders, the `#flag` compile/link directives,
  and the `C.uwlv_*` FFI declarations). Declares `module uwl`.
- `uwl/uwl_shim.{c,h}` — the C shim: compiles the loader and exposes a primitive `uwlv_*` surface (the
  loader's value constructors are `static inline` / awkward to pass by value).
- `uwl/universal_wasm_loader.h` — vendored copy of the upstream C loader (the C header keeps its
  upstream filename; the V module directory is `uwl/`).
- **Scripts are V only** (`.vsh`, or a built V program); no Bash/Nushell/PowerShell/`.bat`. See
  `cmem/INDEX.md` Policy "Scripts are V".
- `scripts/fetch-wasmtime.vsh` — fetches the wasmtime C API SDK into `vendor/` (gitignored).
- `scripts/zigcc.v` — Zig-as-C-compiler tool (V's default `tcc` can't link wasmtime). Build once:
  `v -o scripts/zigcc.exe scripts/zigcc.v` (binary gitignored).
- `scripts/bump-version.vsh` / `release.vsh` / `publish.vsh` — the release toolchain
  (`v.mod` version is the single source of truth; publish is a deliberate, separate, VPM step).
- Run the example: `export VFLAGS="-cc $(pwd -W)/scripts/zigcc.exe"; v run examples/adder.v`.
