# universalWasmLoader-v

Idiomatic **V** binding for the [Universal WASM Loader](https://github.com/synapticforge1/universalWasmLoader-c).
It wraps the C single-header loader so you call `.wasm` exports with native V
values and `!`/`or` error handling.

The hard parts (WIT parsing, Canonical ABI marshalling, `cabi_post` string
returns, version pinning) live **once**, in the C loader. This repo is a thin
wrapper over it (a small C shim + a V module) — built on the
[wasmtime C API](https://docs.wasmtime.dev/c-api/).

## Quick start

```v
import uwl

m := uwl.import_module('tests/math_50.wasm')!
defer { m.free() }

sum := m.call_i32('add', uwl.i32(3), uwl.i32(4))!            // 7
prod := m.call_f64('multiply', uwl.f64(2.5), uwl.f64(4.0))!  // 10.0

s := uwl.import_module('tests/strings_50.wasm')!
defer { s.free() }
greeting := s.call_str('greet', uwl.text('World'))!          // "Hello, World!"
```

Wrap each argument with `uwl.i32` / `i64` / `f32` / `f64` / `boolean` / `text`
so the WIT type is unambiguous, and pick the call by its result type
(`call_i32` / `call_i64` / `call_f64` / `call_bool` / `call_str`). A companion
`.wit` next to the `.wasm` is required.

## Build & run

```sh
bun scripts/fetch-wasmtime.ts   # downloads the wasmtime C API SDK into vendor/ (gitignored)
```

V's default `tcc` cannot link the wasmtime import library, so pick a C compiler:

**Use Zig as the C compiler** (recommended — no separate MinGW install needed; Zig
bundles a C toolchain). A small V tool, `scripts/zigcc.v`, adapts Zig for V
(see notes below). Build it once, then pass it to V:

```sh
v -o scripts/zigcc.exe scripts/zigcc.v
v -cc "$(pwd -W)/scripts/zigcc.exe" run examples/adder.v
```

Make it the default for every `v` command in the shell via `VFLAGS` (use a
Windows-style path):

```sh
export VFLAGS="-cc $(pwd -W)/scripts/zigcc.exe"
v run examples/adder.v
```

**Or use MinGW gcc:**

```sh
v -cc gcc run examples/adder.v
```

Either way prints:

```
adder(3, 4) = 7
multiply(2.5, 4.0) = 10.0
square(5) = 25
```

### ⚠️ Breaking Changes

| Version | What changed | How to migrate |
| ------- | ------------ | -------------- |
| —       | none since 1.0.0 | — |

Versions follow [Semantic Versioning 2.0.0](https://semver.org): a breaking
change always comes with a new major version, after at least one minor release
that marks the old form `@[deprecated]`.

## Tests

```sh
bun scripts/test.ts   # v test over tests/ (builds the zigcc tool on first use)
```

`tests/` holds the shared reference fixtures, copied unmodified from the
reference loader and checked against `tests/fixtures.json` by sha256.

## API

- `uwl.import_module(path string) !Module` — load a module (its `.wit` is
  auto-detected; a `@N` path suffix pins the version).
- `m.call_i32 / call_i64 / call_f64 / call_bool / call_str(name, ...Arg) !T` —
  call an export. Build args with `uwl.i32/i64/f32/f64/boolean/text`.
- `m.free()` — free the module.

Errors propagate as V results (`!`), so use `!` or `or { ... }`.

## How it works

`uwl/uwl_shim.{h,c}` is a tiny C shim that compiles the loader
and exposes a primitive-only surface (`uwlv_*`). It exists because the loader's
value constructors are `static inline` (not linkable) and `uwl_val_t` is awkward
to pass by value across V's FFI — the shim marshals through a flat `uwlv_arg`
array and out-parameters instead. The shim header deliberately avoids including
the wasmtime headers, keeping them out of V's translation unit.

## Requirements & notes

- **Choose a C compiler** (V's default `tcc` cannot link the wasmtime import
  library):
  - **Zig** (`scripts/zigcc.exe`, built from `scripts/zigcc.v` with V's default
    compiler) — needs only `zig` on `PATH`; no Git Bash or PowerShell. It
    compiles via `zig cc`, forces the `x86_64-windows-gnu` target, and strips
    V's hardcoded `-Wl,-stack=` flag (V emits it in MSVC form, which Zig's
    bundled `lld` rejects).
  - **MinGW gcc** (`-cc gcc`) — needs a MinGW gcc on `PATH`.
- **`wasmtime.dll` must be findable at runtime** — copy
  `vendor/.../lib/wasmtime.dll` next to your binary (or the repo root for
  `v run`), or add that `lib` directory to `PATH`.
- The binding links the wasmtime **import library** (`libwasmtime.dll.a`), not the
  static archive (which pulls in the Rust std unwinder).
- The vendored C loader header is `uwl/universal_wasm_loader.h`;
  keep it in sync with the upstream
  [`universalWasmLoader-c`](https://github.com/synapticforge1/universalWasmLoader-c) release you target.
- Host import callbacks are not yet exposed from V (pure-compute / library
  modules only). A module's WIT imports still load: each one returns zero, as
  in the reference loader.
- Pick the `call_*` that matches the export's result type: a mismatched call
  currently returns a zero value (`0`, `0.0`, `false`, `''`) instead of an error.
- Maintainers: releases use `bun scripts/bump-version.ts <major|minor|patch>`,
  then `bun scripts/release.ts`, then `bun scripts/publish.ts` (each takes `--help`;
  the scripts need [Bun](https://bun.sh)).

## License

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 Jon Marcum.
