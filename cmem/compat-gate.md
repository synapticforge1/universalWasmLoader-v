# The compatibility gate (workspace letter H6, built 2026-10-26)

🔒 Binding (owner, 2026-09-20; workspace `../../../cmem/layout-and-packaging.md` § "The
compatibility gate"): "backward compatible" is a gate result, never a judgment made at bump time.
The floor and previous-tag logic follow loader-zig's `scripts/compat.ts` (itself after loader-c's);
the surface generator is this repo's own.

## What runs where

| Piece | File | Runs in |
| --- | --- | --- |
| Rule 1, the SURFACE | `scripts/surface.ts` (`v doc -f json` over `uwl/`) → `api-surface.txt` (committed) | `bun scripts/surface.ts` writes it; `--check`, `bump-version.ts` and `compat.ts` refuse a stale one |
| Rule 2, the FLOOR | `scripts/compat.ts` `floorOf` | `bump-version.ts` (refuses below it, `--dry-run` included), `compat.ts` (report), `compat.ts --release` inside `release.ts` |
| Rule 3, BEHAVIOUR | `scripts/compat.ts` `previousTests` → `scripts/test.ts` | the same places; required green for a patch or minor |
| Rule 4, deprecate first | README `### ⚠️ Breaking Changes` table | by hand, when a deprecation lands (V: `@[deprecated]` + a kept alias) |
| Rule 5, re-baseline alone | `surface.ts --check` | an intended surface change is its own commit (`bun scripts/surface.ts`), with the reason |

**The surface** is what V itself reports as public (`v doc -f json -no-timestamp -o stdout uwl`),
not a parse of the source text: every `pub` function, method, struct and other declaration, one
line each. Functions and methods are keyed by name (`fn import_module`, `fn Module.call_i32`) and
recorded as parameter TYPES + return type — V has no named arguments, so renaming a parameter breaks
no caller and is not surface (inverted: a rename leaves `--check` clean). Structs list their `pub`
fields only (`Arg` and `Module` have none, so callers can neither build nor read them except through
the API). A public kind the script cannot key is an error, never skipped. The SPEC version comes
from the vendored header's leading comment, exactly once. **16 symbols, SPEC 3.0.0, on 2026-10-26.**
Not in the surface: the private `C.uwlv_*` FFI block and the `k_*` discriminants (module-private);
`uwl_shim.{c,h}`; the C header beyond its SPEC line. A change there that alters behaviour is Rule
3's to catch.

**The floor:** removed or changed → major; added → minor; nothing → patch; the SPEC version moves it
by its own level (lowered → major). A changed signature is major even when it only widens (errs
high, as -c, -js and -zig).

**A previous tag's surface** is read from that tag's `uwl/` (`git archive` into `.compat/`,
gitignored, deleted after) with TODAY's `surface.ts`, and the SPEC from that tag's header.
**Its tests** are that tag's `tests/` (suite AND fixtures) extracted to `.compat/tests/` and run by
`scripts/test.ts`; `import uwl` there resolves to TODAY's `uwl/`, because V finds the repo's `v.mod`
above `.compat/` (proved: inverting bool decoding in today's source turned the extracted suite red).
The verdict is read from V's per-file summary line and the exit code.

**The version line** is `v.mod` `version:`; `bump-version.ts` takes `major|minor|patch` only (the
explicit `X.Y.Z` form the `.vsh` accepted is gone — workspace SemVer rule) and refuses unless the
version equals the last release tag. **`v1.1.0` has no tests**, so the first bump after it prints
`NOTHING TO RUN (Rule 3 unverified for this step)` and proceeds — Rule 3 starts biting at the first
tag that carries `tests/uwl_test.v`. Measured 2026-10-26: floor vs `v1.1.0` = patch (`uwl/`'s public
API unchanged since; only a doc comment moved).

**Consumers (Rule 3, second half):** none known; wasmtk's H6.5b consumer suites name this repo's
suite as one to exist.

## Inverted end to end, 2026-10-26 (a scratch clone per case; nothing in the repo touched)

19 steps, all as expected; no `.compat/` left behind, no dirty tree.

| Mutant | Command | Result |
| --- | --- | --- |
| clean tree | `compat`; `bump patch --dry-run` | floor patch; allowed (Rule 3: nothing to run at v1.1.0) |
| — | `bump 1.2.0 --dry-run` | refused, exit 2 (`a bump is major\|minor\|patch`) |
| `pub fn ping() int` added, NOT re-baselined | `surface --check`; `bump minor --dry-run` | both refuse: `added: fn ping() int` / snapshot stale |
| same, re-baselined | `bump patch` / `minor` (dry) | refused (floor minor) / allowed → 1.2.0 |
| `call_i64` renamed `call_long`, re-baselined | `bump minor` / `major` (dry) | refused (`major: removed: fn (&Module) call_i64…`) / allowed → 2.0.0 |
| `i64(v i64)` retyped to `i64(v int)`, re-baselined | `bump minor --dry-run` | refused (`major: changed: fn i64(i64) Arg -> fn i64(int) Arg`) |
| `text(v string)` parameter renamed only | `surface --check` | clean (names are not surface) |
| SPEC lowered 3.0.0 → 2.9.0, re-baselined | `bump minor --dry-run` | refused (`major: SPEC 3.0.0 -> 2.9.0 (lowered)`) |
| scratch tag v1.1.1 WITH tests; bool decoding inverted (surface unchanged) | `surface --check`; `compat`; `bump patch` / `major` (dry) | clean (correct: no API change); previous-tag tests RED (booleans); refused / allowed |
| scratch tag v1.1.1 WITH tests; source unchanged (control) | `compat` | GREEN — 42 asserts |
| `version` 1.1.1 with an addition over v1.1.0 | `compat --release --no-tests` | BLOCKED: patch below the floor (minor) |
| `version` 1.2.0 with the same addition | `compat --release` | passes (minor step; v1.1.0 has no tests) |

## Traps met building it

- The vendored header states `SPEC v3.0.0` TWICE; only the leading comment (before the include
  guard) is the declaration, as -c and -zig read it. A mutation script asserting one match caught it.
- **`EBUSY` deleting `.compat/` in the real checkout** (D:, editor open), never in the scratch
  clones on C: — the first real `bump patch --dry-run` crashed with `.compat/uwl` left behind.
  Something briefly holds a just-written directory there (UNVERIFIED which: the editor's watcher or
  the drive); `rmSync`'s `maxRetries` / `retryDelay` fixed it — 5/5 clean runs after. Layer lesson
  (★ 5.2): the scratch inversions could not see it because they ran on another drive.
- V's "to reproduce" hint prints the `.compat/tests/…` path, so "output mentions `.compat`" is not
  evidence of a leftover directory — check the directory.
