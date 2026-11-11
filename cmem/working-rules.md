# working-rules.md — repo-local rules for universalWasmLoader-v

The workspace floor (`../../../cmem/working-rules.md`) applies here in full. This file holds only
what is specific to this repo. **A repo's own rules govern inside that repo.** Scripting is in
[INDEX.md](INDEX.md) § Policy.

## No secrets, no personal information (workspace § Records; letters H22, H25 §3(d), H28)

- 🔒 **Nothing committed is private** (owner, 2026-10-22). Committed `cmem/` is fine as long as it
  displays no secrets and no personal information. Never in a committed file, commit message, tag,
  issue or release: tokens, keys, passwords, `.env` contents; email addresses, machine names,
  private account names, personal drive paths.
- **The path test is "is it machine-specific?", not "is it absolute?"** (🔒 owner, 2026-10-23;
  letter H22). Not public: any path that records the owner's machine layout — a user profile, the
  project tree, other drives, scoop / AppData installs, scratchpad or session ids. Fine: repo- or
  sibling-relative paths, env vars, placeholders (`<repo-root>`), `@VMODROOT`, and a CONVENTION path
  that names nothing about one machine and works on any comparable host. A scan hit is a CANDIDATE
  judged by that test; convention paths are not scrubbed.
- **Scan before committing, binaries included** (workspace C3, 2026-10-26: Zig and Rust debug info
  embedded the owner's paths in committed `.wasm` in two siblings). Run the floor's pattern with
  `git grep -a` as well as `-I`; this repo commits `.wasm` fixtures. HEAD scan 2026-10-26, `-I` and
  `-a`: 0 hits. H25 measured no drive path in any commit of any ref (2026-10-26), so no history
  purge is needed here.
- **The one email allowed is the maintainer contact** (🔒 owner, 2026-10-23 / 2026-10-26; letter
  H28), in at most three places: a registry manifest field (`v.mod` has no email field; VPM reads
  the repo), the git commit author/committer address (used here, allowed), and ONE committed `cmem/`
  note naming the maintainer contact (none here). Not repeated anywhere else, memory included.
- **Private facts go in `cmem/local/`**, gitignored.
- wabt-ts and binaryen-ts are RETIRED (owner, 2026-10-26; H28): never cite `../wabt-ts/…` or
  `../binaryen-ts/…` as a location. This repo cites neither.

## Owner commands: "commit", "push", "release" (owner, 2026-11-10)

🔒 Written into every project by the workspace session on the owner's direction (2026-11-10:
"please write that into each project"; workspace `cmem/working-rules.md` Tooling rule 12, letter
H34). When the owner says:

- **"commit"** — first run "update the project memory files" (re-derive this repo's `cmem/` from
  its current state), then commit to the branch being worked on. Nothing is pushed.
- **"push"** — perform "commit", then merge the branch into `main`, then push `main` (and the
  working branch) to GitHub (`origin`) and read it back with `git ls-remote`.
- **"release"** — perform "push", then the release process: the workspace's
  `cmem/release-process.md` §§ 5–8 — CI checks first, then CI pushes the tag, then the GitHub
  Release page from the tag, then the publish to the registry — recorded in `cmem/release.md`
  § "Release History" (newest first, a summary of what changed). The level (patch / minor /
  major) is the owner's: ask if it was not given.

Each command includes the one before it, and none goes further than its own word (a "commit"
never pushes, a "push" never releases). This repo's own gate and merge rules apply at each step.
