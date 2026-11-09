// Cut a release of universalWasmLoader-v consistently.
//
// The single source of truth for the version is the `version:` field in v.mod.
// This script reads it, runs the gate, tags the current commit `v<version>` and
// pushes the branch and tag to `origin`. The tag push runs
// .github/workflows/release.yml, which creates the GitHub Release page (owner,
// 2026-11-09, workspace row C41; no GitHub CLI, H30); this script prints where
// the page will be. VPM (the V package manager) resolves the package from the
// git repo itself, so the pushed tag/commit is the part that actually matters.
// Publishing to VPM is a separate, deliberate step; see scripts/publish.ts.
//
// Idempotent: if the tag already exists it is reused (must point at HEAD).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { capture, die, has, help, modField, porcelain, readMod, ROOT, run, tagExists } from "./_lib.ts";

const USAGE = `
Cut a release of universalWasmLoader-v (version from v.mod).

Usage: bun scripts/release.ts [options]
  --no-build       Skip the \`v run examples/adder.v\` + \`bun scripts/test.ts\`
                   verification (the compatibility gate still runs).
  --remote <name>  Git remote to push to (default: origin).
  --dry-run        Print what would happen; make no tags/pushes/releases.
  -h, --help       Show this help.

Idempotent: if the tag already exists it is reused (must point at HEAD). The
GitHub Release page is made by .github/workflows/release.yml on the tag push.
`;

process.chdir(ROOT);

let doBuild = true;
let remote = "origin";
let dryRun = false;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--remote") {
    if (i + 1 >= argv.length) die(2, `missing value for ${a}`);
    remote = argv[i + 1];
    i++;
  } else if (a === "--no-build") doBuild = false;
  else if (a === "--dry-run") dryRun = true;
  else if (a === "-h" || a === "--help") help(USAGE);
  else die(2, `unknown argument: ${a}`);
}

// --- Derive version from v.mod (source of truth) ----------------------------
const version = modField(readMod(), "version");
if (!version) die(1, "could not read version from v.mod");
const tag = `v${version}`;
console.log(`Releasing ${tag} (from v.mod)`);

// --- Preflight checks -------------------------------------------------------
if (porcelain() !== "") {
  console.error("error: working tree is dirty — commit or stash before releasing.");
  console.error(capture(["git", "status", "--short"]).out);
  process.exit(1);
}

const branch = capture(["git", "rev-parse", "--abbrev-ref", "HEAD"]).out;
console.log(`On branch: ${branch}`);

// If the tag already exists, it must point at the current commit.
let tagIsThere = false;
if (tagExists(tag)) {
  const tagCommit = capture(["git", "rev-parse", `${tag}^{commit}`]).out;
  const head = capture(["git", "rev-parse", "HEAD"]).out;
  if (tagCommit !== head) {
    console.error(`error: tag ${tag} exists but does not point at HEAD.`);
    console.error("       Bump version in v.mod or move the tag deliberately.");
    process.exit(1);
  }
  console.log(`tag ${tag} already exists at HEAD — reusing.`);
  tagIsThere = true;
}

// --- Verify it builds -------------------------------------------------------
// V's default tcc cannot link wasmtime. If VFLAGS already selects a C compiler
// (-cc ...), trust it and run plain `v`. Otherwise use the zigcc tool (built
// from scripts/zigcc.v on first use) when `zig` is on PATH, else fall back to
// plain `v` (may fail).
if (doBuild) {
  console.log("Verifying build (v run examples/adder.v)…");
  if ((process.env.VFLAGS ?? "").includes("-cc")) {
    run(dryRun, ["v", "run", "examples/adder.v"]);
  } else if (has("zig")) {
    const zigcc = join(ROOT, "scripts", process.platform === "win32" ? "zigcc.exe" : "zigcc");
    if (!existsSync(zigcc)) run(dryRun, ["v", "-o", zigcc, join(ROOT, "scripts", "zigcc.v")]);
    run(dryRun, ["v", "-cc", zigcc, "run", "examples/adder.v"]);
  } else {
    console.error("warning: no -cc in VFLAGS and zig not found; trying default compiler.");
    run(dryRun, ["v", "run", "examples/adder.v"]);
  }
  run(dryRun, ["bun", "scripts/test.ts"]);
}

// --- Compatibility gate: v.mod version vs the tag before it (Rules 1-3) -----
// Runs under --dry-run too: it changes nothing, and a release it would block
// should be known before anything is tagged.
run(false, ["bun", "scripts/compat.ts", "--release"]);

// --- Tag, push, release -----------------------------------------------------
if (!tagIsThere) run(dryRun, ["git", "tag", "-a", tag, "-m", `universalWasmLoader-v ${tag}`]);

run(dryRun, ["git", "push", remote, branch]);
run(dryRun, ["git", "push", remote, tag]);

// Read the push back (H32): the remote's branch and the tag's peeled commit must both be HEAD.
if (!dryRun) {
  const head = capture(["git", "rev-parse", "HEAD"]).out;
  const ls = capture(["git", "ls-remote", remote, `refs/heads/${branch}`, `refs/tags/${tag}^{}`]);
  if (ls.code !== 0) die(1, `git ls-remote ${remote} failed; check the push by hand`);
  const seen = new Map(ls.out.split("\n").filter(Boolean).map((l) => {
    const [id, ref] = l.split("\t");
    return [ref, id] as [string, string];
  }));
  const remoteBranch = seen.get(`refs/heads/${branch}`) ?? "(missing)";
  const remoteTag = seen.get(`refs/tags/${tag}^{}`) ?? "(missing)";
  console.log(`read back from ${remote}: ${branch} = ${remoteBranch}, ${tag}^{} = ${remoteTag}`);
  if (remoteBranch !== head || remoteTag !== head) die(1, `${remote} does not hold HEAD (${head}) for both; check the push`);
}

// The tag push runs .github/workflows/release.yml, which makes the page.
console.log(`The tag push runs .github/workflows/release.yml, which creates the GitHub Release page:`);
console.log(`  ${releasePageUrl(capture(["git", "remote", "get-url", remote]).out, tag)}`);

console.log(`Done: ${tag}`);

/** Where the Release page for `tag` appears, from a remote URL (https or ssh form). */
function releasePageUrl(remoteUrl: string, tag: string): string {
  const m = remoteUrl.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?\/?$/);
  if (!m) return `(remote ${remoteUrl || remote} is not a GitHub URL; no workflow runs there)`;
  return `https://github.com/${m[1]}/${m[2]}/releases/tag/${tag}`;
}
