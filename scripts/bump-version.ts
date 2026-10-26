// Bump the project version in v.mod (the single source of truth).
//
// Updates the `version:` field to the next semver, commits the one-line change,
// and stops there; tagging/pushing/releasing is scripts/release.ts's job.
// Typical flow:
//
//     bun scripts/bump-version.ts minor   # 1.0.0 -> 1.1.0, commits the bump
//     bun scripts/release.ts              # tags v1.1.0, pushes, GitHub Release
//
// Refuses to run on a dirty tree (so the bump lands as an isolated commit) and
// rejects a target that isn't strictly greater than the current version or whose
// tag already exists.
import { readFileSync, writeFileSync } from "node:fs";
import { capture, die, fieldSpan, help, MOD_FILE, porcelain, ROOT, run, tagExists } from "./_lib.ts";

const USAGE = `
Bump the project version in v.mod (the single source of truth).

Usage: bun scripts/bump-version.ts <major|minor|patch|X.Y.Z> [options]
  major|minor|patch   Increment that semver component (resets lower ones).
  X.Y.Z               Set an explicit version (must be valid semver).
  --no-commit         Edit v.mod only; don't commit.
  --dry-run           Print the new version + planned actions; change nothing.
  -h, --help          Show this help.

Refuses to run on a dirty tree (so the bump lands as an isolated commit) and
rejects a target that isn't strictly greater than the current version or whose
tag already exists.
`;

function parseSemver(s: string): number[] | null {
  const parts = s.split(".");
  if (parts.length !== 3) return null;
  if (parts.some((p) => !/^\d+$/.test(p))) return null;
  return parts.map(Number);
}

function greater(a: number[], b: number[]): boolean {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

process.chdir(ROOT);

let doCommit = true;
let dryRun = false;
let spec = "";
for (const a of process.argv.slice(2)) {
  if (a === "--no-commit") doCommit = false;
  else if (a === "--dry-run") dryRun = true;
  else if (a === "-h" || a === "--help") help(USAGE);
  else if (a === "major" || a === "minor" || a === "patch") spec = a;
  else if (/^\d/.test(a) && a.split(".").length - 1 >= 2) spec = a;
  else die(2, `unknown argument: ${a}`);
}
if (!spec) die(2, "missing bump spec (major|minor|patch|X.Y.Z). See --help.");

// --- Current version --------------------------------------------------------
let text: string;
try {
  text = readFileSync(MOD_FILE, "utf8");
} catch (e) {
  die(1, `cannot read ${MOD_FILE}: ${e}`);
}
const span = fieldSpan(text, "version");
if (!span) die(1, `current version in ${MOD_FILE} is not plain semver: '<empty>'`);
const [s, e] = span;
const cur = text.slice(s, e);
const cv = parseSemver(cur);
if (!cv) die(1, `current version in ${MOD_FILE} is not plain semver: '${cur}'`);

// --- Compute target ---------------------------------------------------------
const next = spec === "major"
  ? `${cv[0] + 1}.0.0`
  : spec === "minor"
  ? `${cv[0]}.${cv[1] + 1}.0`
  : spec === "patch"
  ? `${cv[0]}.${cv[1]}.${cv[2] + 1}`
  : spec;

const nv = parseSemver(next);
if (!nv) die(2, `'${spec}' is not valid semver (X.Y.Z).`);

// --- Validate (strictly greater, tag free) ----------------------------------
if (!greater(nv, cv)) die(1, `target ${next} is not greater than current ${cur}.`);
if (tagExists(`v${next}`)) die(1, `tag v${next} already exists.`);

console.log(`Bumping version: ${cur} -> ${next}`);

// --- Preflight: clean tree --------------------------------------------------
if (doCommit && !dryRun && porcelain() !== "") {
  console.error("error: working tree is dirty — commit or stash so the bump is isolated.");
  console.error(capture(["git", "status", "--short"]).out);
  process.exit(1);
}

// --- Apply ------------------------------------------------------------------
if (!dryRun) {
  // Replace only the version value, preserving formatting.
  try {
    writeFileSync(MOD_FILE, text.slice(0, s) + next + text.slice(e));
  } catch (err) {
    die(1, `cannot write ${MOD_FILE}: ${err}`);
  }
}
console.log(`+ set version: '${next}' in ${MOD_FILE}`);

if (doCommit) {
  run(dryRun, ["git", "add", MOD_FILE]);
  run(dryRun, ["git", "commit", "-m", `Bump version: v${cur} -> v${next}`]);
}

console.log(`Done: ${next}`);
if (doCommit) {
  console.log(`Next: bun scripts/release.ts   # tags v${next}, pushes, creates the GitHub Release`);
}
