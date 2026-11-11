// Start a release of universalWasmLoader-v: push `main` with the bump commit; CI does the rest.
//
// 🔒 The owner's order (2026-11-10; workspace letter H33, release-process.md § 5): "the CI to
// check first, then push the tag, and then create the release page from the tag, then publish the
// package to the registry". So this script (U4) runs the gate as a user, pushes `main` ONLY and
// reads it back; it makes and pushes NO tag. The push runs .github/workflows/release.yml:
// `checks` → `tag` (CI's annotated tag on the commit checks passed) → `release` (the GitHub
// Release page from the tag) → `publish` (for VPM the tag is the publish: `v install` as a user,
// in CI, fatal).
//
// The version is v.mod's `version:` (bump it first: scripts/bump-version.ts <level>).
//
// Guards, each refusing with exit 1 (nothing is pushed):
//   - a clean tree (untracked files count);
//   - on `main`, with `origin/main` (fetched) an ancestor of HEAD (no divergence);
//   - the tag v<version> absent locally and on origin (a released version never moves);
//   - the cold gate: the example, the suite, and the compatibility gate in release mode.
//
// VPM installs the repository's `main` (measured 2026-11-10: a scratch `v install` gave `main`'s
// HEAD, two commits past the last tag) — every push to `main` reaches VPM users, so this gate,
// and the one before EVERY push (cmem/INDEX.md), is what guards them; CI's `checks` confirms.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { capture, die, has, help, modField, porcelain, readMod, ROOT, run, tagExists } from "./_lib.ts";

const USAGE = `
Start a release of universalWasmLoader-v (version from v.mod): gate, push main, read it back.
CI then checks, tags, makes the Release page and reads VPM back (.github/workflows/release.yml).

Usage: bun scripts/release.ts [options]
  --remote <name>  Git remote (default: origin).
  --dry-run        Run every guard and the gate; push nothing.
  -h, --help       Show this help.

Refuses a dirty tree (untracked files count), a branch other than main, a main that does not
contain <remote>/main, and a version whose tag exists locally or on the remote. Makes NO tag.
`;

process.chdir(ROOT);

let remote = "origin";
let dryRun = false;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--remote") {
    if (i + 1 >= argv.length) die(2, `missing value for ${a}`);
    remote = argv[i + 1];
    i++;
  } else if (a === "--dry-run") dryRun = true;
  else if (a === "-h" || a === "--help") help(USAGE);
  else die(2, `unknown argument: ${a}`);
}

// --- Version ------------------------------------------------------------------
const version = modField(readMod(), "version");
if (!/^\d+\.\d+\.\d+$/.test(version)) die(1, `could not read a plain semver version from v.mod ('${version}')`);
const tag = `v${version}`;
console.log(`Releasing ${tag} (from v.mod)`);

// --- Guards -------------------------------------------------------------------
if (porcelain() !== "") {
  console.error(capture(["git", "status", "--short"]).out);
  die(1, "the working tree is not clean (untracked files count) — commit first");
}
const branch = capture(["git", "rev-parse", "--abbrev-ref", "HEAD"]).out;
if (branch !== "main") die(1, `on '${branch}', not main — merge the release branch into main first`);
if (capture(["git", "fetch", "-q", remote]).code !== 0) die(1, `git fetch ${remote} failed`);
if (capture(["git", "merge-base", "--is-ancestor", `${remote}/main`, "HEAD"]).code !== 0) {
  die(1, `main does not contain ${remote}/main — pull or rebase first; nothing pushed`);
}
if (tagExists(tag)) die(1, `tag ${tag} exists locally — this version is released; bump first`);
const remoteTag = capture(["git", "ls-remote", "--tags", remote, `refs/tags/${tag}`]);
if (remoteTag.code !== 0) die(1, `git ls-remote ${remote} failed`);
if (remoteTag.out !== "") die(1, `tag ${tag} exists on ${remote} — this version is released; bump first`);
console.log(`guards: clean tree, on main, contains ${remote}/main, ${tag} absent locally and on ${remote}`);

// --- The cold gate --------------------------------------------------------------
// V's default tcc cannot link wasmtime: use VFLAGS' -cc when set, else the zigcc tool (built from
// scripts/zigcc.v on first use) when zig is on PATH.
console.log("Gate: the example, the suite, the compatibility gate (release mode)…");
if ((process.env.VFLAGS ?? "").includes("-cc")) {
  run(false, ["v", "run", "examples/adder.v"]);
} else if (has("zig")) {
  const zigcc = join(ROOT, "scripts", process.platform === "win32" ? "zigcc.exe" : "zigcc");
  if (!existsSync(zigcc)) run(false, ["v", "-o", zigcc, join(ROOT, "scripts", "zigcc.v")]);
  run(false, ["v", "-cc", zigcc, "run", "examples/adder.v"]);
} else {
  die(1, "no -cc in VFLAGS and zig not on PATH; the gate cannot build the example");
}
run(false, ["bun", "scripts/test.ts"]);
run(false, ["bun", "scripts/compat.ts", "--release"]);

// --- Push main ONLY, read it back -------------------------------------------------
const head = capture(["git", "rev-parse", "HEAD"]).out;
run(dryRun, ["git", "push", remote, "main"]);
if (!dryRun) {
  const ls = capture(["git", "ls-remote", remote, "refs/heads/main"]);
  if (ls.code !== 0) die(1, `git ls-remote ${remote} failed; check the push by hand`);
  const remoteMain = ls.out.split("\t")[0] || "(missing)";
  console.log(`read back from ${remote}: main = ${remoteMain}`);
  if (remoteMain !== head) die(1, `${remote}/main is ${remoteMain}, not HEAD ${head}; check the push`);
}

const m = capture(["git", "remote", "get-url", remote]).out.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?\/?$/);
const base = m ? `https://github.com/${m[1]}/${m[2]}` : "(not a GitHub remote)";
console.log(`CI now checks ${head.slice(0, 7)}, tags ${tag}, makes the page and reads VPM back:`);
console.log(`  ${base}/actions   →   ${base}/releases/tag/${tag}`);
console.log(`Done${dryRun ? " (dry run: nothing pushed)" : ""}: ${tag}`);
