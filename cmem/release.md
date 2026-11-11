# release.md — how universalWasmLoader-v releases, and every release

🔒 **The ONE place this project records its releases** (owner, 2026-11-10: "releases should be
recorded in one place in every project; … release.md should be the file name with the newest first
in the 'Release History' with a summary of what changed in each one" — workspace letter H33, D3).
`cmem/overview.md` § "Release / publish flow" points here.

## The process (since 2026-11-10; the owner's order)

🔒 Owner, 2026-11-10 (H33 D1): "the CI to check first, then push the tag, and then create the
release page from the tag, then publish the package to the registry". The owner's words (H34,
`working-rules.md`): **"release" = "push", then this process; the level is the owner's** — ask if
not given. Workspace slots in brackets (`../../../cmem/release-process.md` § 5).

1. **[U1, U2] The level from the owner; the bump is its own commit.** On a `release/X.Y.Z` branch:
   `bun scripts/bump-version.ts <major|minor|patch>`. The level is a required argument. It refuses a
   dirty tree (untracked files count), a version line that is not the last tag, a stale
   `api-surface.txt`, and a level below the FLOOR (the surface diff since the last tag: removed or
   changed → major, added → minor; [compat-gate.md](compat-gate.md)). For a patch or a minor it
   runs the previous tag's tests on this tree [U3]. It commits `bump to vX.Y.Z`. Then `merge
   --no-ff` into `main`.
2. **[U4] `bun scripts/release.ts`** on `main`. Guards: a clean tree, on `main`, containing
   `origin/main` (fetched), the tag absent locally and on `origin`. The cold gate: the example (the
   SDK's `lib/` on PATH), the suite, `compat.ts --release`. Then it pushes **`main` ONLY** and reads
   it back with `ls-remote`. It makes **no tag**. `--dry-run` runs everything but the push.
3. **CI, `.github/workflows/release.yml`, on that push to `main`** (one run; a tag CI makes with its
   own token starts no new run, so every step is a `needs:` of the one before):
   - [U5] **`checks`** (windows-latest, tokenless clone): HEAD = `github.sha`; "is this a release?"
     — `v.mod`'s version is plain semver, above every `v*` tag, and not tagged yet; then the gate:
     suite, example, surface, `compat.ts --release` (report mode when it is not a release).
   - [U6] **`tag`**: `scripts/github-tag.ts` makes the annotated tag `vX.Y.Z` on the commit
     `checks` passed, through the REST API. A tag already at that commit means done; a tag anywhere
     else is refused (a published tag never moves). It reads the tag back.
   - [U7] **`release`**: `scripts/github-release.ts` makes the GitHub Release page FROM the tag
     (H32's order; generated notes under a VPM line), reads it back, and peels the tag again.
   - [U8, U10] **`publish`**: VPM has no upload — it installs the repository's `main` (measured
     2026-11-10) — so the tag is the publish. This job is the read-back as a user: a scratch
     `v install synapticforge1.uwl` must give this version, on a tree containing the tagged commit.
     It fails otherwise.
   - [U9] `permissions: {}` at the top, each job only its own. No `uses:`: Bun 1.4.4, Zig 0.17.1
     and V 0.5.2 come from official zips pinned by version and sha256, and the wasmtime SDK by sha256
     in `scripts/fetch-wasmtime.ts`. One concurrency group per commit, never cancelled. Every REST
     call has a 30 s limit (best-practices 7.21).
4. **[U10] Read back as a user** here too after the run (a scratch `v install`), and **[U11] record
   it below**. [U12] On a failure: "Re-run failed jobs" — each job skips what is done (a tag at
   this commit, an existing page); never a new tag for the same code, never a moved tag.

⚠️ **VPM serves `main`, not the tag** (measured 2026-11-10: a scratch `v install` gave
`bb6363f`, `v2.0.2-2-gbb6363f`, two commits past `v2.0.2`). **Every push to `main` reaches VPM
users**, so the local full gate before EVERY push (`cmem/INDEX.md`) is what guards them; CI's
`checks` confirms after the fact. The tag and the Release page mark the release. `v update` pulls
the repository the same way.

`scripts/publish.ts` stays a logged no-op (VPM registration is one-time, at
https://vpm.vlang.io/new): it checks the tag locally and on `origin` and prints how VPM resolves.

### The proofs (2026-11-10, before landing — best-practices 7.22)

- `scripts/github-tag.ts` + `scripts/github-release.ts` (shared `scripts/_github.ts`): a one-time
  stateful mock-API harness, **23 cases all PASS** — tag: none → tag object + ref + read-back;
  lightweight / annotated tag already at the commit → no write; at another commit → refused, no
  write; dry-run; no token; tag-object 422; ref 422; read-back elsewhere; stalled API (exit 1 in
  ~1 s); bad tag; unknown argument. Page: tag missing → refused, no POST; lightweight / annotated →
  POST; other commit → refused; page exists → no write; dry-run; POST 422; draft read-back; no
  token; tag moved during the write; stalled API. **Five mutants, each caught only by its own
  case(s):** no refuse-elsewhere, no read-back, no existing-tag stop (3 cases), no sha check in the
  page script, no time limit (both hang cases; the tag one wrote after 50 s).
- `scripts/release.ts`: a scratch clone pushing to a scratch bare remote, **9 checks PASS** —
  untracked file, not on `main`, tag local, tag on the remote (refused by the local guard after
  `git fetch` brings the tag down — refused either way), diverged `origin/main`, `--dry-run`
  (gate ran, remote unchanged), and the real run: `main` pushed and read back, **no tag on the
  remote**. It found a defect, fixed in `88173aa`: the example relied on a stray gitignored
  `wasmtime.dll` at the repo root; a clean clone died with exit 53. The SDK's `lib/` now goes on
  PATH through an explicit child `env`, because assigning `process.env.PATH` does not reach a child
  on Windows, where the variable is `Path`.
- The workflow's **"is this a release?"** step, its exact `run:` text extracted from the YAML, against
  scratch remotes: **6 cases PASS** — tagged, untagged above the newest, a major, below the newest
  (numeric: 2.9.0 < v2.10.0) refused, no tags at all, not plain semver. The no-tags case found a
  defect, fixed in `cb964c0`: an empty `grep` killed the step under `pipefail`.
- The **`publish`** read-back step, exact text, against the real VPM: `v2.0.2` at `df6ebbe` → pass;
  `v2.0.3` → fail; a commit not in the tree → fail. **3/3.**
- **On GitHub (2026-11-10):** run 42942241240 (`main` push, not a release) — `checks` green, the
  others skipped. Run 42943746360 (v2.0.3) — `checks`, **`tag`** and **`release`** green (CI's
  tag by `github-actions[bot]`, the page from it); **`publish` failed** in `v install` on the
  runner, cause unreadable without admin rights (see 2.0.3 below). The read-back passed outside CI.
  The diagnosable step (retries + public annotations) is rehearsed 4/4 and first runs at the next
  release.

### Before 2026-11-10 (history)

Until 2.0.2 the owner's machine made the tag: `release.ts` tagged and pushed `main` + the tag, and
the tag push ran the workflow (`checks` → `release`, 2026-11-09, H32). Before that the GitHub
Release page was an owner item (2026-11-09, H30), and before that `gh release create` (until
2026-11-09). The 2026-10-26 port of the four `.vsh` scripts to TypeScript on Bun (H15) was proven
by an output-diff, 42 cases identical; see `cmem/overview.md` § "Release / publish flow".

## Release History

Newest first. Each entry: what changed, the level and why, how it was cut, and what was read back.

### 2.0.4 — 2026-11-10 — patch

**What changed:** CI's `publish` read-back is fixed. V 0.5.2's `vpm` clones into TEMP and then
moves the clone into `VMODULES`, which fails across drives, and that failed 2.0.3's read-back on
the runner. The step now uses a same-drive TEMP, retries, and annotates its causes publicly.
README § Install tells users the same remedy. `uwl/` unchanged since v2.0.3. **Level:** patch,
the owner's (asked; floor patch). **Cut:** gate on `59c76c5` → `main` pushed; run
**42946800656** `checks` green (not a release) → `bump-version.ts patch` → release notes → merge →
`release.ts`. **Read back:** recorded after the run.

### 2.0.3 — 2026-11-10 — patch

**What changed:** the release process in the owner's order (H33): `release.ts` pushes `main` only
and never tags. CI on that push runs `checks` (with "is this a release?") → `tag` (CI's annotated
tag, REST) → `release` (the page from the tag) → `publish` (a `v install` read-back in CI, fatal).
The bump commit is now `bump to vX.Y.Z`. `cmem/release.md` is the one release record (D3). The
release gate puts the SDK's `lib/` on the example's PATH (it had relied on a stray
`wasmtime.dll`). `uwl/` unchanged since v2.0.2. **Level:** patch, the owner's (asked; the floor is
patch, and v2.0.2's 89 asserts are green on this tree). **Cut:** gate on `34c1214` → `main` pushed;
the new workflow's first run, **42942241240**, ran `checks` green ("not a release": v2.0.2 tagged)
and skipped `tag` / `release` / `publish` → `bump-version.ts patch` (`816025b`) → release notes
(`7405875`) → merge **`be2bf59`** → `release.ts`: guards, gate (example, 89/89,
`compat --release` patch step), `main` pushed (`34c1214..be2bf59`) and read back, **no local tag**.
**CI run 42943746360 — the first release in the owner's order:** `checks` green ("a release
candidate"); **`tag` green** — CI's annotated tag **`v2.0.3` (`ce101e0`, tagger
`github-actions[bot]`) → `be2bf59`**; **`release` green** — the page by **`github-actions[bot]`**,
not a draft, `releases/latest` = v2.0.3. ⚠️ **`publish` FAILED**: its read-back step ended with
"Process completed with exit code 1" and none of its own `::error::` lines, so `v install` itself
failed on the runner. The job log needs admin rights, so the cause was not readable. **Read back as
a user (U10), outside CI: PASS** — a scratch `v install synapticforge1.uwl` gave 2.0.3 at
`be2bf59`, with the installed V and with a fresh V from the same pinned zip. So VPM serves the
release, and only CI's read-back is unproven. **Fix (U12, rehearsed before landing, 4/4):** the step
now retries `v install` three times (300 s each), puts `v`'s own output into a PUBLIC annotation on
each failure, and annotates the two other silent paths found while rehearsing (a missing `v.mod`, a
tree that is not a git checkout). It lands with this record and is first exercised at the next
release. **CAUSE FOUND (2026-11-10), from the job log the owner pasted** (a re-run of the failed
job, 02:25): `vpm` cloned into `C:\Users\runneradmin\AppData\Local\Temp\v_0\vpm_modules\…` (the
system TEMP, on C:), then had to MOVE the clone into `VMODULES` = `D:\a\_temp\vmodules` (on D:):
`error: failed to install`. A rename cannot cross drives. **Reproduced locally:** `VMODULES` on D:
with TEMP on C: → the same error, exit 1; a same-drive TEMP → installed 2.0.3. **Fixed** in the
step: TEMP and TMP point beside VMODULES under `RUNNER_TEMP`. Proven under the runner's layout
(`RUNNER_TEMP` on D:, TEMP on C:): the OLD step text (from git) fails with CI's exact error; the
NEW text passes (2.0.3, containing `be2bf59`). My first rehearsals passed only because they put
everything on C:. The same pitfall hits USERS whose `VMODULES` and TEMP are on different drives:
README § Install now says how to avoid it.

### 2.0.2 — 2026-11-09 — patch

**What changed:** the CI release workflow (H32: `checks` on windows-latest, then the GitHub Release
page from `scripts/github-release.ts`); Bun 1.4.4 pinned by sha256 (H31); `fetch-wasmtime.ts`
sha256-pinned and time-limited; `release.ts` reads its push back. `uwl/` unchanged since v2.0.1.
**Level:** patch — floor patch, v2.0.1's 89 asserts green. **Cut:** gate on `aace4e6` → `main`
pushed → CI `checks` green on GitHub first (run 42652413051) → `bump-version.ts patch` (`72f39a7`)
→ merge **`df6ebbe`** → `release.ts`: annotated tag **`v2.0.2` (`91f4907`) → `df6ebbe`**, `main` +
tag pushed, read back. **Read back:** tag run **42653181536** (`checks` → `release`) made the
first CI Release page, author **`github-actions[bot]`**, not a draft, `releases/latest`; tag
unmoved; a scratch VPM install gave 2.0.2 at `df6ebbe`.

### 2.0.1 — 2026-11-09 — patch

**What changed:** loader-c v2.1.0's header and `uwl_err` (C39): a failing host callback now stops
the WASM at the import, void imports included, and the message keeps 2.0.0's wording
(`host callback <name> failed: <msg>`). `release.ts` / `bump-version.ts` without the GitHub CLI
(H30). **Level:** patch — surface unchanged (27 symbols), v2.0.0's 87 asserts green (an earlier
draft that passed wasmtime's trap text through turned them red, so the wording was kept). **Cut:**
gate on `5bef88a` → `main` pushed → `bump-version.ts patch` (`56217e2`) → merge **`03307ac`** →
`release.ts`: annotated tag **`v2.0.1` (`ef2299a`) → `03307ac`**, read back. **Read back:** a
scratch VPM install gave 2.0.1 at `03307ac`, `uwl_err` in the shim. No Release page (owner: "only
new tags will get release pages").

### 2.0.0 — 2026-11-08 — MAJOR

**What changed:** SPEC 4.0.0 (C29) — the loader-c v2.0.0 header (only an absent `.wit` is raw; a
strict WIT parser; every WIT import needs a callback; typed calls checked, never coerced);
kind-checked `call_*` results (S8) with new `call_f32` / `call_void`; host import callbacks
(`import_module_with`, `HostFn`, `Arg.as_*`, `nothing`); the zigcc fix for Zig 0.17.1.
**Level:** major — `SPEC 3.0.0 -> 4.0.0` plus 11 additions (16 → 27 symbols). **Cut:**
`bump-version.ts major` (`5bdd646`) → merge **`3cfce9a`** → gate (87/87, `compat --release` major
step) → `release.ts`: annotated tag **`v2.0.0` (`538c053`) → `3cfce9a`**, `main` + tag pushed
(`b12c584..3cfce9a`), read back. The bump came BEFORE the push on purpose: report-mode `compat.ts`
was red by design (v1.1.1's intended-break test). **Read back:** a scratch VPM install gave 2.0.0 at
`3cfce9a`. No Release page.

### 1.1.1 — 2026-10-26 — patch

**What changed:** the scripts ported to TypeScript on Bun with the compatibility gate (H15, H6);
the V test suite over the stamped fixtures (42 asserts); `.gitattributes`; the example loads
`tests/math_50.wasm`; README fixes. **Level:** patch — surface unchanged (16 symbols, SPEC 3.0.0).
**Cut:** `bump-version.ts patch` → merge **`f5c964d`** → `release.ts` (example, 42/42,
`compat --release`): annotated tag **`v1.1.1` (`e9594a3`) → `f5c964d`**, pushed, read back.
**Read back:** published on VPM (owner), verified by an install. The first tag that carries
`tests/`. No Release page.

### 1.1.0 — 2026-06-19 — minor

**What changed:** nothing beyond the version line — `c21df51` "Bump version: v1.0.0 -> v1.1.0" is
the direct child of `17af221`, the commit the local-only `v1.0.0` tag names (`git log
v1.0.0..v1.1.0` lists only the bump). It was the first version tagged on `origin`. **Cut:** annotated tag **`v1.1.0` → `c21df51`** on `origin`.
Whether a GitHub Release page existed was never checked; none is made now.

### 1.0.0 — 2026-06-19 — first version (never published as a tag)

**What changed:** the V binding over the C loader (SPEC 3.0.0), renamed to the VPM-valid module
`uwl`, with documented API. **Cut:** tag `v1.0.0` → `17af221` exists **only locally**; it was never
pushed. The repository was registered on VPM the same day.
