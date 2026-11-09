# universalWasmLoader-v

Idiomatic **V** binding for the [Universal WASM Loader](https://github.com/synapticforge1/universalWasmLoader-c).
It wraps the C single-header loader so you call `.wasm` exports with native V
values and `!`/`or` error handling.

The hard parts (WIT parsing, Canonical ABI marshalling, `cabi_post` string
returns, version pinning) live **once**, in the C loader. This repo is a thin
wrapper over it (a small C shim + a V module) — built on the
[wasmtime C API](https://docs.wasmtime.dev/c-api/).

## Install

```sh
v install synapticforge1.uwl
```

The module is published on [VPM](https://vpm.vlang.io), which installs it from
this repository. It still needs the wasmtime C API SDK and a C compiler that
can link it; see [Build & run](#build--run).

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
(`call_i32` / `call_i64` / `call_f32` / `call_f64` / `call_bool` / `call_str`,
or `call_void` to discard it). Nothing is coerced: a wrong argument count or
kind, or a `call_*` that does not match the export's result, is an error naming
the export. A companion `.wit` next to the `.wasm` gives the typed interface;
only when it is absent do you get the module's raw exports.

### Host import callbacks

A module whose `.wit` declares imports needs a V callback for every one, keyed
by the import's camelCase name (WIT `env-mul` → `envMul`):

```v
m := uwl.import_module_with('tests/imports_50.wasm', {
	'envMul': uwl.HostFn(fn (a []uwl.Arg) !uwl.Arg {
		return uwl.f64(a[0].as_f64()! * a[1].as_f64()!)
	})
	'envAdd': fn (a []uwl.Arg) !uwl.Arg {
		return uwl.i32(a[0].as_i32()! + a[1].as_i32()!)
	}
})!
defer { m.free() }
m.call_f64('scale', uwl.f64(3.0), uwl.f64(4.0))!  // 12.0
```

Read each argument with `as_i32` / `as_i64` / `as_f32` / `as_f64` / `as_bool`
/ `as_str`, and return the result built like a call argument (`uwl.nothing()`
for an import with no result). The kind must be the import's WIT result kind;
another kind fails the export call, naming the callback, the import, the type
and the value. An error the callback returns fails the export call as
`host callback <name> failed: <message>`. A missing callback fails the load,
naming every missing one. Callbacks may be closures; the module keeps them
alive until `free()`.

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
| 2.0.0   | Conforms to SPEC 4.0.0 (the C loader v2.0.0). A `call_*` whose kind does not match the export's result is an error (it returned `0` / `0.0` / `false` / `''`); `call_f64` no longer widens an `f32` result. A module whose `.wit` declares an import fails to load, naming each missing callback (each import used to return zero). A `.wit` that exists but cannot be read, or does not parse (e.g. a `u32` type), fails the load instead of falling back to raw exports. | Use `call_f32` for an `f32` export and `call_void` for a void one; match each `call_*` to the WIT result. Load a module with WIT imports through the new `import_module_with(path, callbacks)`, giving a callback for every import. Fix any `.wit` the loader now names. |

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
- `uwl.import_module_with(path string, callbacks map[string]uwl.HostFn) !Module` —
  the same, with host callbacks for the module's WIT imports
  (`type HostFn = fn (args []Arg) !Arg`; see [Host import callbacks](#host-import-callbacks)).
- `arg.as_i32 / as_i64 / as_f32 / as_f64 / as_bool / as_str() !T` — read a
  callback argument (another kind is an error); `uwl.nothing()` — a void result.
- `m.call_i32 / call_i64 / call_f32 / call_f64 / call_bool / call_str(name, ...Arg) !T` —
  call an export whose WIT result is that kind (any other kind is an error).
  Build args with `uwl.i32/i64/f32/f64/boolean/text`.
- `m.call_void(name, ...Arg) !` — call an export and discard any result.
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
    bundled `lld` rejects). It also keeps `-Wincompatible-pointer-types` a
    warning: Zig 0.17 makes it an error, and V 0.5.2's own runtime trips it.
    After pulling a change to `scripts/zigcc.v`, delete `scripts/zigcc.exe` so
    it is rebuilt.
  - **MinGW gcc** (`-cc gcc`) — needs a MinGW gcc on `PATH`.
- **`wasmtime.dll` must be findable at runtime** — copy
  `vendor/.../lib/wasmtime.dll` next to your binary (or the repo root for
  `v run`), or add that `lib` directory to `PATH`.
- The binding links the wasmtime **import library** (`libwasmtime.dll.a`), not the
  static archive (which pulls in the Rust std unwinder).
- The vendored C loader header is `uwl/universal_wasm_loader.h`;
  keep it in sync with the upstream
  [`universalWasmLoader-c`](https://github.com/synapticforge1/universalWasmLoader-c) release you target.
- A callback for an import with no result cannot stop the WASM code that
  called it: the C loader gives such an import no way to trap. If it returns
  an error, the WASM function runs on to its end, and then the export call
  fails with that error.
- The loader reads local files only (no http), so SPEC § 11's fetch time limit
  does not apply.
- Maintainers: releases use `bun scripts/bump-version.ts <major|minor|patch>`,
  then `bun scripts/release.ts`, then `bun scripts/publish.ts` (each takes `--help`;
  the scripts need [Bun](https://bun.sh)).

## License

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 Jon Marcum.
