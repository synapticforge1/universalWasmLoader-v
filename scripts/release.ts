// Cut a release of universalWasmLoader-v consistently.
//
// The single source of truth for the version is the `version:` field in v.mod.
// This script reads it, tags the current commit `v<version>`, pushes the branch
// and tag to `origin`, and (unless --no-release) creates the matching GitHub
// Release. VPM (the V package manager) resolves the package from the git repo
// itself, so the pushed tag/commit is the part that actually matters; the GitHub
// Release is human-readable polish. Publishing to VPM is a separate, deliberate
// step; see scripts/publish.ts.
//
// Idempotent: if the tag already exists it is reused (must point at HEAD); an
// existing GitHub Release is left untouched.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { capture, die, has, help, modField, porcelain, readMod, ROOT, run, tagExists } from "./_lib.ts";

const USAGE = `
Cut a release of universalWasmLoader-v (version from v.mod).

Usage: bun scripts/release.ts [options]
  --notes <text>   Release notes body (default: a generic line).
  --no-release     Push the tag only; skip creating a GitHub Release.
  --no-build       Skip the \`v run examples/adder.v\` verification.
  --remote <name>  Git remote to push to (default: origin).
  --dry-run        Print what would happen; make no tags/pushes/releases.
  -h, --help       Show this help.

Idempotent: if the tag already exists it is reused (must point at HEAD); an
existing GitHub Release is left untouched.
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
}

// --- Tag, push, release -----------------------------------------------------
if (!tagIsThere) run(dryRun, ["git", "tag", "-a", tag, "-m", `universalWasmLoader-v ${tag}`]);

run(dryRun, ["git", "push", remote, branch]);
run(dryRun, ["git", "push", remote, tag]);

if (makeRelease) {
  if (!has("gh")) {
    console.error("warning: gh CLI not found — skipping GitHub Release (tag is pushed).");
  } else if (capture(["gh", "release", "view", tag]).code === 0) {
    console.log(`GitHub Release ${tag} already exists — leaving it untouched.`);
  } else {
    const body = notes ||
      `Release ${tag} of universalWasmLoader-v — idiomatic V binding for the Universal WASM Loader.`;
    run(dryRun, ["gh", "release", "create", tag, "--title", tag, "--notes", body]);
  }
}

console.log(`Done: ${tag}`);
