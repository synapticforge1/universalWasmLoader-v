// Cut a release of universalWasmLoader-v consistently.
//
// The single source of truth for the version is the `version:` field in v.mod.
// This script reads it, tags the current commit `v<version>`, pushes the branch
// and tag to `origin`, and (unless --no-release) prints the GitHub Release page
// as an OWNER item: the web-UI link that opens it pre-filled. No `gh` (owner,
// 2026-11-08; workspace letter H30). VPM (the V package manager) resolves the
// package from the git repo itself, so the pushed tag/commit is the part that
// actually matters; the GitHub Release is human-readable polish. Publishing to
// VPM is a separate, deliberate step; see scripts/publish.ts.
//
// Idempotent: if the tag already exists it is reused (must point at HEAD).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { capture, die, has, help, modField, porcelain, readMod, ROOT, run, tagExists } from "./_lib.ts";

const USAGE = `
Cut a release of universalWasmLoader-v (version from v.mod).

Usage: bun scripts/release.ts [options]
  --notes <text>   Release notes body for the GitHub Release link (default: a generic line).
  --no-release     Push the tag only; do not print the GitHub Release owner item.
  --no-build       Skip the \`v run examples/adder.v\` + \`bun scripts/test.ts\`
                   verification (the compatibility gate still runs).
  --remote <name>  Git remote to push to (default: origin).
  --dry-run        Print what would happen; make no tags/pushes/releases.
  -h, --help       Show this help.

Idempotent: if the tag already exists it is reused (must point at HEAD). The
GitHub Release page is an owner item: its pre-filled link is printed.
`;

process.chdir(ROOT);

let notes = "";
let makeRelease = true;
let doBuild = true;
let remote = "origin";
let dryRun = false;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--notes" || a === "--remote") {
    if (i + 1 >= argv.length) die(2, `missing value for ${a}`);
    if (a === "--notes") notes = argv[i + 1];
    else remote = argv[i + 1];
    i++;
  } else if (a === "--no-release") makeRelease = false;
  else if (a === "--no-build") doBuild = false;
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

if (makeRelease) {
  // A GitHub web-UI task, so an owner item: the link opens the form pre-filled.
  const body = notes ||
    `Release ${tag} of universalWasmLoader-v — idiomatic V binding for the Universal WASM Loader.`;
  console.log(`OWNER: create the GitHub Release page for ${tag}:`);
  console.log(`  ${releasePageUrl(capture(["git", "remote", "get-url", remote]).out, tag, body)}`);
}

console.log(`Done: ${tag}`);

/** GitHub's "new release" form for `tag`, pre-filled, from a remote URL (https or ssh form). */
function releasePageUrl(remoteUrl: string, tag: string, body: string): string {
  const m = remoteUrl.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?\/?$/);
  if (!m) return `(remote ${remoteUrl || remote} is not a GitHub URL; create the Release for ${tag} by hand)`;
  const q = new URLSearchParams({ tag, title: tag, body });
  return `https://github.com/${m[1]}/${m[2]}/releases/new?${q}`;
}
