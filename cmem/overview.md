# overview — universalWasmLoader-v

## What this is

`universalWasmLoader-v` is the **idiomatic V binding** of the Universal WASM Loader family. It is a
thin wrapper over the C single-header loader
([`universalWasmLoader-c`](https://github.com/synapticforge1/universalWasmLoader-c)) — the V sibling of the
reference JS loader [`@jrmarcum/universal-wasm-loader`](https://jsr.io/@jrmarcum/universal-wasm-loader).
The hard parts (WIT parsing, Canonical ABI marshalling, `cabi_post` string returns, version pinning)
live **once** in the C loader; this repo only adds a V-native call surface (a small C shim + a V
module) on top.

- **Language / runtime:** V (developed against **V 0.5.1**; built and tested on **V 0.5.2 `7647ce1`**
  since 2026-10-21), built on the
  [wasmtime C API](https://docs.wasmtime.dev/c-api/) (**v45.0.2**) as the WASM engine.
- **What it gives V callers:** native V argument/result values, `!`/`or` result-based error handling
  (no out-params surfaced to V), and a small typed call surface — no manual `uwl_val_t` boxing.
- **Distribution:** a V module (`v.mod` name `uwl`, **1.1.1** since 2026-10-26, **2.0.0** since 2026-11-08 (SPEC 4.0.0 + host callbacks), **2.0.1** (loader-c 2.1.0's `uwl_err`) and **2.0.2** (the CI release workflow) since 2026-11-09 (on VPM, install-verified) — every release in [release.md](release.md), MIT) published via **VPM** (the V package
  manager, https://vpm.vlang.io). The MIT `LICENSE` file ships with the repo; README's License section
  links it. **Naming note:** the VPM registry name MUST be letters/digits/dots only (no underscores,
  2–35 chars; see `is_valid_mod_name` in `vlang/vpm`), so the package is `uwl` (full registry name
  **`synapticforge1.uwl`** since 2026-10-22, installed via `v install synapticforge1.uwl`; the
  original `jrmarcum.uwl` listing is gone since, see "Repository home"). The V module is correspondingly `module uwl`
  in the `uwl/` directory and imported as `import uwl` — matching how the `-zig` sibling exposes its
  importable module as `uwl` even though its package name is longer.

## Repository home — `synapticforge1` organization (recorded 2026-10-21)

The owner **transferred the GitHub repo from the personal account `jrmarcum` to the owner-controlled
`synapticforge1` organization**. Canonical URL: **https://github.com/synapticforge1/universalWasmLoader-v**
(`git ls-remote` verified 2026-10-21: its `HEAD` is `c21df51`, the same as local `main`). The old
`jrmarcum/...` URL still works through GitHub's transfer redirect. Sibling loaders moved with it,
including the upstream `synapticforge1/universalWasmLoader-c`. The JSR reference package name
`@jrmarcum/universal-wasm-loader` is a JSR-scope fact and is **not** changed by the move.

- **VPM: now `synapticforge1.uwl` (owner registered it 2026-10-22).** VPM prefixes the package name
  with the **repo's GitHub owner**, not the registering user. Proof: the new listing is id 771, name
  `synapticforge1.uwl`, url `https://github.com/synapticforge1/universalWasmLoader-v.git`, and its
  author is still `jrmarcum`. The install command is `v install synapticforge1.uwl`.
  **Re-checked 2026-10-26 (VPM API + a real install):** the original listing `jrmarcum.uwl` (id 721)
  is GONE (`/api/packages/jrmarcum.uwl` → `"404"`; on 2026-10-22 it still existed); the
  `synapticforge1.uwl` description now shows its em dash correctly (the `â` glitch is gone).
  **1.1.1 is what users get:** `VMODULES=<scratch> v install synapticforge1.uwl` installed `v.mod`
  version `1.1.1` at `f5c964d` (the `v1.1.1` tag's commit), `tests/` included. VPM's API carries no
  version field; the install is the check. **2026-11-08: 2.0.0 is what users get** — the same
  install gave `v.mod` version `2.0.0` at `3cfce9a` (`v2.0.0`'s commit), minutes after the push.
  **2026-11-09: 2.0.1** — `v.mod` 2.0.1 at `03307ac` (`v2.0.1`'s commit), minutes after the push.
  **Same day, 2.0.2** — `v.mod` 2.0.2 at `df6ebbe` (`v2.0.2`'s commit), `.github/` included.
- **Links updated (2026-10-21):** the local `origin` remote now points to
  `https://github.com/synapticforge1/universalWasmLoader-v.git`, and `git fetch` from it works.
  `README.md` and `CLAUDE.md` link the `-c` loader at `synapticforge1/universalWasmLoader-c`. The
  publish script (then `publish.vsh`, now `publish.ts`) says `synapticforge1.uwl`. The only `jrmarcum` strings left outside
  `cmem/` are the JSR scope `@jrmarcum/universal-wasm-loader` in the vendored header, which is
  correct. (The owner removed the README's JSR sentence on GitHub in `61cb1e9`, 2026-10-21.)
- **Org Actions policy / secrets:** no release secret (`release` pushes with local `git`, and
  `publish` is a no-op). Since 2026-11-09 there IS a workflow (`.github/workflows/release.yml`);
  it needs only the job's own `GITHUB_TOKEN` (`contents: write` in its `release` job) and uses no
  `uses:` actions, so an org Actions policy that allows only GitHub-owned actions cannot block it. `release.ts` pushes to `origin`, so
  they follow whichever URL `origin` holds.

## Current state (re-read 2026-11-09; v1 implemented 2026-06-19)

Working tree (39 tracked files, 2026-10-26; still 39 on 2026-11-09):

- `uwl/uwl.v` — the binding (`module uwl`; public API + `#flag` compile/link directives + the
  `C.uwlv_*` FFI declarations). Marshals V `Arg` values into a flat `C.uwlv_arg` array and reads
  results back through out-params. Every public symbol carries a doc comment (see "Documentation
  conventions" below).
- `uwl/uwl_shim.c` — the C shim: `#define UWL_IMPLEMENTATION` + includes the loader header to compile
  its body, and implements the primitive-only `uwlv_*` surface (`uwlv_import_with` / `uwlv_free` /
  `uwlv_call`) by marshalling the `uwlv_arg` array into `uwl_val_t` and back. Since 2026-11-08 it
  also holds the one host-callback trampoline (`uwlv__trampoline` → the V-exported
  `uwlv_host_dispatch`); since 2026-11-09 a V callback error becomes `uwl_err` (see "Host import
  callbacks").
- `uwl/uwl_shim.h` — the self-contained V-facing C header. Deliberately does **not** include
  `universal_wasm_loader.h` or `wasm.h`, so V parses it into its own translation unit without the
  wasmtime headers. It declares `uwlv_host_dispatch`, which V DEFINES (`@[export]`).
- `uwl/universal_wasm_loader.h` — **vendored copy** of the upstream C single-header loader (keeps its
  upstream filename inside the `uwl/` module dir). Keep in sync with the `universalWasmLoader-c`
  release being targeted. **Since 2026-11-09: loader-c's `v2.1.0` (SPEC v4.0.0 + `uwl_err` /
  `UWL_ERR`), byte for byte** (`git -C ../universalWasmLoader-c show v2.1.0:universal_wasm_loader.h`,
  sha256 `01a7ad5e…`; tag `v2.1.0` → `edc6993`, read back with `ls-remote`). **loader-c `v2.1.1`
  (tag → `dc81b25`, `ls-remote`, 2026-11-09) has the SAME header byte for byte** (`01a7ad5e…`);
  its changes are CI only (its H32 Release-page job, the H31 Bun pin), so nothing is re-vendored. From 2026-11-08:
  `v2.0.0` (`5ffa482d…`, the hash loader-zig recorded for its copy). Was loader-c `v1.1.1` (SPEC v3.0.0, `f3af6143…`) on
  2026-10-26. See "SPEC 4.0.0".
- `examples/adder.v` — the runnable example (`v run examples/adder.v`); it loads
  `tests/math_50.wasm`. (Its own older `examples/math_50.{wasm,wit}` — wasm bytes not the stamped
  set — were removed 2026-10-26.)
- `tests/` — the V suite `uwl_test.v` + the stamped reference fixtures (see "Tests").
- `scripts/fetch-wasmtime.ts` — downloads the wasmtime C API SDK into `vendor/` (gitignored).
- `scripts/zigcc.v` — the Zig-as-C-compiler tool, built to `scripts/zigcc.exe` (gitignored; see
  "How it links"). A build tool, not a script (INDEX Policy).
- `scripts/bump-version.ts` / `release.ts` / `publish.ts` (+ `_lib.ts` helpers) — the release
  toolchain ([release.md](release.md)). TypeScript on Bun, one form each (INDEX Policy).
- `scripts/test.ts` (the suite runner), `scripts/surface.ts` + committed `api-surface.txt`,
  `scripts/compat.ts` — the compatibility gate ([compat-gate.md](compat-gate.md)).
- `.gitattributes` — LF pinned wildcard-first; the `.wit` / `.wat` / `.json` fixtures feed the
  sha256 stamp (a clone with `core.autocrlf=true` broke 6 of 12 before it, 0 after; 2026-10-26).
- `vendor/` — wasmtime C API SDK (headers + `libwasmtime.dll.a` + `wasmtime.dll`). **gitignored**;
  fetched on demand. `wasmtime.dll` is also staged at the repo root for `v run` (gitignored).
- `LICENSE` — MIT (Copyright (c) 2026 Jon Marcum), identical text to the `-c` port. README License
  section links it; `v.mod` declares `license: 'MIT'`.
- `cmem/` — this portable project memory. The root `CLAUDE.md` pointer is gitignored since
  2026-10-26 (memory-conventions; it was tracked before — `git show 68e5904:CLAUDE.md` is the last
  tracked text).

Build environment used for v1: V 0.5.1 + Zig 0.16.0 (as the C compiler) + wasmtime C API **v45.0.2**
`x86_64-mingw`. Since 2026-10-21: V 0.5.2 `7647ce1`, same Zig and SDK; scripts on Bun (1.4.4 on
2026-10-26). **Since 2026-11-08: Zig 0.17.1** (the workspace moved; row C37). On it the gate was RED
at `main` before any change: Zig 0.17's clang makes `-Wincompatible-pointer-types` an error, and
V 0.5.2's own `builtin` passes `&u32` to `WriteConsoleW`'s `LPDWORD`. `zigcc.v` now passes
`-Wno-error=incompatible-pointer-types` (a warning again; both types are 32-bit unsigned on
Windows). `test.ts` / `release.ts` build `zigcc.exe` only when it is MISSING, so delete a stale one.

## Documentation conventions (added 2026-06-19)

`uwl/uwl.v` is documented for clarity in a way familiar to the TypeScript sibling's contributors:
every public symbol (the `Module`/`Arg` types, `import_module`, `free`, the six arg builders, and the
`call_i32/i64/f32/f64/bool/str/void` family) and the internal helpers (`invoke`, `expect`,
`kind_name`, `take_err`) carry a doc
comment. Each comment keeps **V's name-prefixed first line** (so `v doc` renders it) and then adds
**JSDoc-style `@param` / `@returns` / `@error` notations** for the parameters, result, and failure
mode. The raw `C.uwlv_*` FFI block is grouped under a banner comment describing it as the only
cross-into-C surface (the V equivalent of a hand-written `.d.ts`), and the `k_*` discriminants and
struct fields have inline notes. **`v fmt` is authoritative** — the file is kept `v fmt`-clean (run
`v fmt -w uwl/uwl.v`; `v fmt -verify` passed on V 0.5.1). **Stale on V 0.5.2 (measured
2026-10-26):** `v fmt -verify uwl/uwl.v` fails at HEAD — 0.5.2 wraps the `C.uwlv_call(...)` line in
`invoke` one argument later; whitespace only. **Re-formatted 2026-11-08** (`v fmt -w`; `-verify`
clean on V 0.5.2 for `uwl/uwl.v`, `tests/uwl_test.v`, `scripts/zigcc.v`). `examples/adder.v` follows the same comment style.

## Public API surface (implemented)

All in `uwl/uwl.v`. Idiomatic V over the C loader's explicit `uwl_call` core, reached through the
`uwlv_*` shim.

- **`uwl.import_module(path string) !Module`** — load a `.wasm`; its companion `.wit` is auto-detected,
  a `@N` path suffix pins the version. Returns an error (the C error string, freed after copying) on
  failure. Since 2026-11-08 it is `import_module_with(path, {})` (no callbacks).
- **`uwl.import_module_with(path string, callbacks map[string]HostFn) !Module`** (added 2026-11-08,
  owner: "yes we want to add the host callback feature") — host callbacks keyed by the camelCase WIT
  import name; wraps `uwlv_import_with` → `uwl_import(path, cbs, n, err)`. See "Host import
  callbacks" below.
- **`uwl.Module`** — a loaded, ABI-translated module (`handle &C.uwl_module_t`, plus the private
  `state &HostState` the callbacks share).
- **`m.free()`** — `uwlv_free` → `uwl_free`; releases the module and all resources it owns.
- **Typed calls** — pick the call by the export's result type; since 2026-11-08 (SPEC 4.0.0) any
  other result kind is an error, `export '<name>' returns <kind>, not <want>` (the C loader's own
  wording), through the internal `Module.expect`:
  - `m.call_i32(name string, args ...Arg) !int` — export returning `s32`.
  - `m.call_i64(name string, args ...Arg) !i64` — export returning `s64`.
  - `m.call_f32(name string, args ...Arg) !f32` — export returning `f32` (added 2026-11-08).
  - `m.call_f64(name string, args ...Arg) !f64` — export returning `f64` (it also widened `f32`
    before 2026-11-08).
  - `m.call_bool(name string, args ...Arg) !bool` — export returning `bool`.
  - `m.call_str(name string, args ...Arg) !string` — export returning `string` (the C heap string is
    copied into a V string, then freed with `uwlv_free_str`).
  - `m.call_void(name string, args ...Arg) !` — discards any result, as C's `uwl_call_void`
    (added 2026-11-08, so a void export stays callable).
- **Arg builders** — wrap each argument so its WIT type is unambiguous: `uwl.i32`, `uwl.i64`,
  `uwl.f32`, `uwl.f64`, `uwl.boolean`, `uwl.text`. (`Arg` is a tagged struct; only the field matching
  its `kind` is marshalled.)
- Errors propagate as V results (`!`), so callers use `!` or `or { ... }`.

### Arg/result marshalling (across the FFI)

`Module.invoke` builds a `[]C.uwlv_arg` from the `[]Arg`, passing the string pointer only for `k_str`
args, then calls `C.uwlv_call` with out-params (`out_kind`, `out_i`, `out_d`, `out_s`, `err`). The
shim (`uwl_shim.c`) converts each `uwlv_arg` into a `uwl_val_t` via the loader's `uwl_i32/i64/f32/
f64/bool/str` constructors, invokes `uwl_call`, frees any string args, then writes the result back
into the matching out-param. For a string result the shim **transfers ownership** of the heap string
to V (`*out_s = out.str; out.str = NULL`), and V frees it with `uwlv_free_str` after copying. The
`k_*` discriminants in `uwl.v` must stay in lockstep with `uwl_kind_t` in the loader header
(`1=i32 2=i64 3=f32 4=f64 5=bool 6=str`, `0=void`).

**A companion `.wit` gives the typed interface**; since the v2.0.0 header the C `uwl_call` checks
the count and each argument's kind against it (no coercion: `uwl.f64(2.7)` for an `s32` is refused,
naming the export and the parameter). The `Arg` builder IS the kind, so V cannot send an
out-of-range `s32` (`uwl.i32` takes a V `int`); 2³¹ needs `uwl.i64`, which is refused by kind.
Without a `.wit` the exports are raw and the engine checks them.

### Host import callbacks (2026-11-08)

- **API:** `pub type HostFn = fn (args []Arg) !Arg`. A callback reads its arguments with
  `Arg.as_i32 / as_i64 / as_f32 / as_f64 / as_bool / as_str() !T` (another kind →
  `argument is <kind>, not <want>`), and returns an `Arg` built with the call builders;
  `uwl.nothing()` is the void value. The loader checks the kind against the import's WIT result and
  traps with its own message (`host callback envAdd (WIT import "env-add" -> s32) returned 2.9
  (f64); expected s32 (uwl_i32)`), which reaches the export's caller as `<export>: trap: …`.
- **Path across the FFI:** the shim has ONE `uwl_host_fn_t`, `uwlv__trampoline`, registered for
  every callback with `userdata` = a `&HostSlot` (name, closure, `&HostState`). It converts the
  decoded `uwl_val_t` args to `uwlv_arg` (strings borrowed) and calls `uwlv_host_dispatch`, a V
  function exported with `@[export: 'uwlv_host_dispatch']`. That function rebuilds `[]Arg` (strings
  copied), runs the closure, and writes the result `uwlv_arg`; the shim turns it back into a
  `uwl_val_t` (a string is copied). The header's prototype has no `const` on `args`: it must match
  the one V generates (a `const` gave "conflicting types").
- **Callback errors (since 2026-11-09, loader-c 2.1.0's `uwl_err`, row C39):** dispatch sets the
  result to kind `k_err` (7, `UWL_ERR`) with the message, and the shim returns `uwl_err(msg)`. The
  loader traps at the import, VOID imports too, so the WASM stops there. That is tested: a second
  void import `after` does not run. Dispatch also records `host callback <name> failed: <msg>`
  (the first per call) in `HostState`, and `invoke` reports THAT text in place of wasmtime's
  (`<export>: error while executing at wasm backtrace: … Caused by: host callback <name> (WIT
  import "<wit>") failed: <msg>`, multi-line). This keeps the 2.0.0 wording, which v2.0.0's suite
  pins: without the override, its two error tests went red under Rule 3, which would have made a
  patch a break. **History (2.0.0, 2026-11-08):** the C API had no error channel. The shim
  returned `uwl_void()`, which trapped only an import with a result; after a void import, the WASM
  ran on to the end of the export before the call failed.
- **Lifetime:** the C loader keeps only raw pointers, which V's GC cannot see, so every `&HostSlot`
  is rooted in `HostState.slots`, reachable from the `Module`. This is REASONED, not proven by a
  test: with the rooting removed, the suite (including a `gc_collect()` before the call) still
  passed, because a conservative collector rarely reuses the memory that soon.
- **Linker by-product:** a binary that `dllexport`s `uwlv_host_dispatch` makes lld write an import
  library next to it (`examples/uwl_shim.lib` after `v run`); `*.lib` / `*.exp` are gitignored.
- **Not covered:** a callback that calls back into the same Module (re-entry would reset
  `HostState`); a V `panic` in a callback (aborts the process, as any V panic).

## SPEC 4.0.0 (2026-11-08, workspace row C29)

Re-aligned to SPEC 4.0.0 (`../universalWasmLoader-js/SPEC.md`, loader-js 2.0.0). Items 1–3 come from
the vendored C header (loader-c v2.0.0): (1) the `.wit` is read before the `.wasm`; raw only when it
is absent; any other read failure → `cannot read .wit '<path>': <strerror>`. (2) the strict parser →
`invalid .wit '<path>': …`; a WIT export the module lacks fails the load. (3) every WIT import needs
a callback; V passes none, so `imports_50` → `no host callback for WIT imports: envMul (WIT
"env-mul"), envAdd (WIT "env-add")`. The binding's own part: (4) the kind-specific `call_*` refuse a
result of another kind (S8), plus `call_f32` / `call_void`. (5) n/a: local files only, no http.
Rows of § 8 "Refusals" that need a callback (only `envMul`, callback results, async) are n/a here.
The string-result-import row reports the missing callback (checked first in the C loader) — it
names `env-mul` before any `.wasm` is read. **Version decision: MAJOR, 2.0.0** (behaviour accepts
less; the gate floor is major by the SPEC move) — **RELEASED 2026-11-08** (tag `v2.0.0` →
`3cfce9a`; see [release.md](release.md)).
Commits: `74d61c3` (behaviour + tests + docs), `8f63370` (surface re-baseline alone, 16 → 18).
**Gate on `8f63370`:** suite GREEN 70/70; example the three adder lines; `surface.ts --check`
current (18 symbols, SPEC 4.0.0); `compat.ts` floor **major** (`major: SPEC 3.0.0 -> 4.0.0`, two
`minor: added`) and v1.1.1's own tests on the new code RED 40 / 1 — exactly
`test_imports_50_without_host_callbacks_reads_zero`, the intended break (Rule 3 binds only a
patch / minor); `bump major --dry-run` allowed, `bump minor --dry-run` refused (below the floor).
**Update, same day (host callbacks added):** the callback rows are no longer n/a. Only `envMul` →
`no host callback for WIT import: envAdd (WIT "env-add")`. `envAdd` returning nothing() / 2.9 /
2³¹ / 17 as s64 / true / "17" → each named, with the callback, the import, `s32` and the value
(JS's `null` has no V value). Async is n/a: a V callback has a fixed `!Arg` type, so it cannot
return a future. The string-result-import row now reports its own refusal (`a WIT import returning
a string is not supported: envMul (WIT "env-mul")`), since both callbacks are given. § 8
`imports_50`: `scale(3, 4)` = 12.0, `combine(10, 7)` = 17.

## How it links

V's default `tcc` cannot link the wasmtime import library, so a C compiler must be chosen. The
`#flag` lines in `uwl.v` add the include paths (the shim dir + the wasmtime SDK `include/`), compile
`uwl_shim.c`, link the wasmtime **import library** (`libwasmtime.dll.a`) — NOT the static archive
(which pulls in the Rust std unwinder) — and link the MinGW syslibs wasmtime needs (`ws2_32 bcrypt
userenv ntdll ole32 Shlwapi advapi32 kernel32 uuid`).

Two compiler paths (README "Requirements & notes"):

- **Zig as the C compiler (recommended)** — `scripts/zigcc.v`, a small V program built once with
  V's default compiler (`v -o scripts/zigcc.exe scripts/zigcc.v`; `release.ts` builds it on first
  use). It runs `zig cc -target x86_64-windows-gnu`, copies each `@*.rsp` response file to
  `*.zig.rsp` without V's hardcoded MSVC-form `-Wl,-stack=<n>` (which Zig's bundled `lld` rejects),
  drops that flag from direct arguments too, and passes everything else through `os.Process`, which
  re-quotes each argument with the Windows rules. Since 2026-11-08 it adds
  `-Wno-error=incompatible-pointer-types` (Zig 0.17; see the build environment above). Use it via `v -cc <path>/zigcc.exe run ...` or
  `export VFLAGS="-cc <path>/zigcc.exe"`.
  **History (2026-10-21):** it replaced `zigcc.{bat,ps1,sh}`. The `.bat` → `powershell -File` chain
  broke on V 0.5.2: PowerShell binds an argument like `-I"C:\dir"` as a named parameter `-IC:` and
  splits it into `-IC` and `\dir`, losing the colon. V 0.5.2 passes exactly that when it compiles
  its bundled libgc (`\…\libgc\include: unrecognized file extension`). A V binary gets its argv
  from the C runtime, so the problem cannot recur. Verified with a cold `~/.vmodules/.cache`.
- **MinGW gcc** — `v -cc gcc run ...` (needs MinGW gcc on `PATH`).

`wasmtime.dll` must be findable at runtime: it is staged at the repo root for `v run` (and lives in
the SDK `lib/`).

## Build / run flow

- `bun scripts/fetch-wasmtime.ts [VERSION] [PLATFORM]` — fetch the wasmtime C API SDK into
  `vendor/` (Bun only: `fetch()` with 3 attempts + an in-process zip extractor, stored + deflate;
  defaults `45.0.2` / `x86_64-mingw`). **Windows SDKs only** (`*-mingw`, `*-windows`): wasmtime
  ships the Linux/macOS C API as `.tar.xz`; the script refuses those platforms up front. It keeps no
  `.zip` on disk (the `.vsh` downloaded to `vendor/<name>.zip` and removed it after). **Since
  2026-11-09:** a 300 s limit per attempt (best-practices 7.21), and a sha256 pin per SDK (`PINS`;
  v45.0.2 mingw = `233ac3d1…f7c26`, measured that day — wasmtime publishes no checksum file). A
  mismatch refuses before extracting (proven: a zero pin → exit 1, `vendor/` empty); an SDK
  without a pin downloads with a warning that prints its hash.
- Run the example (Zig-cc path, from the repo root):
  ```sh
  v -o scripts/zigcc.exe scripts/zigcc.v            # once
  export VFLAGS="-cc $(pwd -W)/scripts/zigcc.exe"
  v run examples/adder.v
  ```
  Expected output:
  ```
  adder(3, 4) = 7
  multiply(2.5, 4.0) = 10.0
  square(5) = 25
  ```
  **Verified 2026-06-19** (V 0.5.1 + Zig 0.16.0, wasmtime v45.0.2) — matches the README.
  **Re-verified 2026-10-21** after V was reinstalled (**V 0.5.2 `7647ce1`** + Zig 0.16.0, wasmtime
  v45.0.2), through the V `zigcc` tool.

## Tests (added 2026-10-26, workspace letter H7)

`bun scripts/test.ts [DIR]` runs `v -stats test` over `tests/` with the zigcc tool as `-cc` (built on
first use unless `VFLAGS` already sets `-cc`) and the SDK's `lib/` on `PATH`; the verdict is read
from V's per-file summary line as well as the exit code (`GREEN: N asserts passed`).

**Fixtures:** the workspace's stamped reference set, copied byte for byte from loader-js `36aa661`
(`git cat-file blob 36aa661:tests/<f>`; stamp = wasmtk `4a5c3cf668d`, describe `v2.0.3-64-g4a5c3cf`):
the ten `*_50.{wasm,wit}`, `init_check.{wat,wasm}` and `fixtures.json`. 12/12 sha256 match the
stamp, and all 13 files are `cmp`-identical to loader-zig's `tests/`. Never regenerate them here
(loader-dart found `describe` is not reproducible across clones); re-copy from loader-js.

**`tests/uwl_test.v`, 10 tests / 42 asserts (2026-10-26, V 0.5.2, all green):** every fixture's
sha256 vs `fixtures.json`, both directions (nothing unlisted); `math_50` (7, 10.0, 25); `booleans_50`
(six bool cases); `strings_50` (`greet`, `shout`, `strLen`); `init_check` → 99 (SPEC §10
`_initialize`, raw-exports path); `wasi_io_50` → 42 (WASI `fd_write`; prints `doubling` — no hang
under `v test`, unlike Zig's `--listen=-` runner); `imports_50` without callbacks loads and reads 0
from both exports; `@9` pin refused; missing file refused; unknown export refused.
**Inverted** (a scratch copy per mutant; control green): fixture one byte short → stamp, math and
unknown-export tests red; an unlisted file in `tests/` → stamp test red; bool decode inverted →
booleans red; call error ignored → unknown-export red; import error ignored → `@9` and
missing-file red; string result upper-cased → strings red.
⚠️ **My first expectation was WRONG, kept so it is not "fixed":** I wrote the `imports_50` test as
"fails to load without host callbacks". It loaded: the C loader bound every WIT import and one with no
callback returned zero (`universal_wasm_loader.h:666-669`), exactly as the JS reference did (`abi.js`
`if (!cb) return fn.result ? 0 : undefined`). SPEC 3.0.0 §4 was silent on a missing callback.
**SPEC 4.0.0 made it a refusal (2026-11-08); the test now asserts the refusal.**

**2026-11-08 (SPEC 4.0.0): 16 tests / 70 asserts, all green** (V 0.5.2, Zig 0.17.1). The
`imports_50` test became "fails naming both" (`envMul`, `envAdd`), and six refusal tests were
added from SPEC § 8: a string-result import (names `env-mul`, no `.wasm` read); typed-call
arguments (`add(text, 1)`, `add(2.7, 1)`, `add(1, 2³¹ as s64)`, `add(1)`, `greet(42)`,
`isEven("4")` — each names the export and the parameter or the count); result-kind mismatch for all
six accessors (exact messages), `call_void` discards; a `.wit` that does not parse (`a: s32 b: s32`,
`u32`) names the `.wit` and the fault; a WIT export the module lacks names `cube`; absent `.wit` →
raw `add(3, 4)` = 7, while a `.wit` that is a directory → `cannot read .wit`. Variant `.wit` files
sit in a scratch dir in the system temp beside a COPY of the fixture `.wasm`; `tests/` is untouched.
**Inverted:** the v1.1.1 header under the new suite → 47 passed / 6 failed, exactly the six
loader-level refusal tests (the result-kind test stays green: it is the binding's); the result-kind
check disabled → only the result-kind test red. Control: the v1.1.1 header + the old suite → 42/42.

**2026-11-08, host callbacks: 21 tests / 87 asserts, all green.** Added: § 8 `imports_50` with
callbacks (12.0, 17; a callback for a name the `.wit` does not import is ignored); only `envMul`;
six wrong callback result kinds; a callback's error (and a wrong-kind `as_f64` read) reaching the
export's caller as `host callback envAdd failed: …`, with the next call clean; a void import
(`ping`) on a hand-assembled 59-byte module written to a scratch dir with its `.wit` (a closure
records the arguments; a failing callback still fails `run`). The string-result test now passes
both callbacks and asserts the exact string-result refusal. **Inverted:** callback errors not
recorded → exactly the two error-propagation tests red; dispatch always reporting `s32` → the
`imports_50` and wrong-kind tests red (`envMul`'s f64 now traps); slots not rooted → still green
(see "Host import callbacks", Lifetime).

**2026-11-09, loader-c 2.1.0 (`uwl_err`): 21 tests / 89 asserts, all green.** The void-import
module grew to 76 bytes (hand-assembled again): a second void import, `after`, is called after
`ping`, and a failing `ping` must leave `after` uncalled. **Inverted:** the shim mapping a V error
to `uwl_void()` (the 2.0.0 path) → exactly that assertion red (`the WASM ran past the failing
import`). An intermediate version reported wasmtime's text, and v2.0.0's suite went 2 red under
`compat.ts`; the 2.0.0 wording was kept, and v2.0.0's 87 asserts are green on the new code (floor
patch).

## Release / publish flow → [release.md](release.md)

🔒 **Every release, the process and the history, lives in [release.md](release.md)** (owner,
2026-11-10, workspace H33 D3: one place, `cmem/release.md` § "Release History", newest first).
Moved there 2026-11-10 from this section: the per-release records (1.0.0 … 2.0.2), the release
state, and the CI workflow's description and proofs. The scripts, in one line each:

1. **`scripts/bump-version.ts <major|minor|patch>`** — the level is a required argument; the gate
   (floor, previous-tag tests; [compat-gate.md](compat-gate.md)); commits `bump to vX.Y.Z`.
2. **`scripts/release.ts`** — guards, the cold gate, then pushes **`main` only** and reads it back;
   CI tags (since 2026-11-10, the owner's order).
3. **`scripts/github-tag.ts`** / **`scripts/github-release.ts`** (shared `scripts/_github.ts`) — run
   by `.github/workflows/release.yml`: CI's tag, then the Release page from it.
4. **`scripts/publish.ts`** — the VPM no-op (registration was one-time; VPM installs `main`).

**Port to Bun (2026-10-26, workspace letter H15)** — kept here because it is about the scripts.
The four `.vsh` were ported to TypeScript and deleted only after an output-diff proved each port
equivalent: a one-time harness ran the `.vsh` and the `.ts` on the same inputs, each in a fresh
throwaway clone at the same path with a local bare remote, and compared exit code, stdout, stderr
and the resulting state. **42 cases, 42 identical**: bump 16, release 11, publish 12, fetch 3.
**Inverted:** one exit code changed in a scratch copy of the bump port → exactly the 2 cases that
reach it reported DIFF. ⚠️ Found on the way: under a ~200-character base path the `.vsh` fetch
failed after writing part of the tree, where the port extracted everything; Windows' 260-character
path limit in V's `szip` is the suspected layer — UNVERIFIED. (The release and bump behaviour that
proof covered has changed since; [release.md](release.md) has today's.)

## Known gaps / not yet done

- ~~A mismatched `call_*` is SILENT-WRONG~~ — **FIXED 2026-11-08 (SPEC 4.0.0, S8):** measured
  2026-10-26 (`call_str` on `s32` → `''`, `call_i32` on `f64` → `0`, wrong argument kinds → `0`);
  now the result kind is checked by `Module.expect` and the arguments by the C loader.
- ~~Host imports load as zeros~~ — **since 2026-11-08 (SPEC 4.0.0, S9) a module with WIT imports
  is REFUSED at load**, naming every missing callback.
- ~~No `call_f32`~~ — added 2026-11-08.
- ~~Host import callbacks are not exposed from V~~ — **added 2026-11-08** (`import_module_with`).
- ~~A failing callback for a VOID import cannot stop the WASM after it~~ — **fixed 2026-11-09**
  with loader-c 2.1.0's `uwl_err` (row C39; "Host import callbacks").
- **GC rooting of the callbacks is untested** (reasoned only; see "Host import callbacks").
- **String/aggregate args beyond flat scalars + strings** rely entirely on the C loader; there is no
  V-side validation beyond the `Arg` builder `kind` tags.
- **Vendored header drift:** `uwl/universal_wasm_loader.h` is a manual copy of upstream
  `universalWasmLoader-c`; there is no automated sync — bump it deliberately per targeted release
  (identical to -c `v1.1.1` on 2026-10-26; to -c `v2.0.0` on 2026-11-08; to -c `v2.1.0` since
  2026-11-09, which is also -c `v2.1.1`'s header).
- ~~OWNER item: GitHub Release pages for `v1.1.1`, `v2.0.0`, `v2.0.1`~~ — **DECIDED, owner
  2026-11-09: "only new tags will get release pages"**; these tags stay without one. New tags get
  theirs from CI ([release.md](release.md)).
- **The `tag` → `release` → `publish` path (2026-11-10, the owner's order) is unproven on GitHub**
  until the next release; rehearsed locally ([release.md](release.md) § "The proofs").
- ~~The CI workflow is unproven on GitHub~~ — **proven 2026-11-09** (runs 42652413051 and
  42653181536; v2.0.2's page by `github-actions[bot]`).
- **C-compiler requirement:** V's default `tcc` cannot link wasmtime; a build needs Zig (via the
  `zigcc` wrapper) or MinGW gcc. The `release` build step depends on one being available (or
  `--no-build`).
