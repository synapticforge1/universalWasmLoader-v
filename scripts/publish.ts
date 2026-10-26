// Publish this package to VPM (the V package manager): a SEPARATE, deliberate
// step, intentionally kept out of release.ts.
//
// VPM has NO upload/CLI publish command. Like Go modules, VPM resolves a package
// from the git repository itself: a module is registered ONCE by submitting its
// git repo URL at https://vpm.vlang.io/new (no auth token, no per-version
// upload). After that, `v install synapticforge1.uwl` clones the repo
// and `v update` pulls new commits. There is nothing to upload per release; the
// pushed tag/commit IS the published artifact once the repo is registered.
//
// So this script is a clearly-logged NO-OP: it confirms the released tag exists
// (so you "publish" exactly what was released), then prints what to do. It exists
// to keep the bump -> release -> publish ritual and shape uniform with the sibling
// ports (crates.io/npm/PyPI, which DO need a real upload).
//
// Prereq order:  bump-version.ts -> release.ts -> publish.ts
//
// Idempotent by nature: re-running changes nothing (no upload happens).
import { capture, die, help, modField, porcelain, readMod, ROOT, tagExists } from "./_lib.ts";

const USAGE = `
Publish to VPM: a logged no-op that checks the release tag (version from v.mod).

Usage: bun scripts/publish.ts [options]
  --yes             Accepted for shape parity; there is no irreversible upload
                    to confirm (VPM publish is a no-op), so it changes nothing.
  --dry-run         Print what would happen; change nothing.
  --allow-dirty     Skip the clean-working-tree check.
  --skip-tag-check  Don't require the v<version> tag to exist locally + on remote.
  --remote <name>   Git remote to check the tag against (default: origin).
  -h, --help        Show this help.
`;

/** Fatal in a real run; downgraded to a warning under --dry-run so the flow is inspectable. */
function guard(dryRun: boolean, msg: string): void {
  if (dryRun) {
    console.error(`warning (ignored under --dry-run): ${msg}`);
    return;
  }
  die(1, msg);
}

process.chdir(ROOT);

let dryRun = false;
let allowDirty = false;
let skipTagCheck = false;
let remote = "origin";
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--yes") continue;
  else if (a === "--dry-run") dryRun = true;
  else if (a === "--allow-dirty") allowDirty = true;
  else if (a === "--skip-tag-check") skipTagCheck = true;
  else if (a === "--remote") {
    if (i + 1 >= argv.length) die(2, "missing value for --remote");
    remote = argv[++i];
  } else if (a === "-h" || a === "--help") help(USAGE);
  else die(2, `unknown argument: ${a}`);
}

// --- Version / tag (source of truth: v.mod) ---------------------------------
const modText = readMod();
const version = modField(modText, "version");
if (!version) die(1, "could not read version from v.mod");
const tag = `v${version}`;
const moduleName = modField(modText, "name") || "uwl";
console.log(`Publishing ${tag} to VPM (module: ${moduleName})`);

// --- Preflight: clean tree --------------------------------------------------
if (!allowDirty && porcelain() !== "") {
  guard(dryRun, "working tree is dirty — commit/stash, or pass --allow-dirty.");
}

// --- Preflight: the release tag exists locally and on the remote ------------
if (!skipTagCheck) {
  if (!tagExists(tag)) {
    guard(dryRun, `tag ${tag} not found locally — run scripts/release.ts first (or --skip-tag-check).`);
  }
  const remoteTags = capture(["git", "ls-remote", "--tags", remote, tag]).out;
  if (!remoteTags.includes(`refs/tags/${tag}`)) {
    guard(dryRun, `tag ${tag} not on ${remote} — push it (scripts/release.ts) before publishing (or --skip-tag-check).`);
  }
}

// --- Publish: a no-op for VPM -----------------------------------------------
// Nothing to upload. --yes/--dry-run are accepted for shape parity with the
// other ports; there is no irreversible action here to confirm or to simulate.
const url = capture(["git", "remote", "get-url", remote]);
const originUrl = url.code === 0 && url.out !== "" ? url.out : "<your repo URL>";

console.log(`VPM has no upload/CLI publish — this step is a no-op (by design).

How VPM publishing actually works (like Go modules — it resolves off the repo):
  1. ONE-TIME registration: submit the repo URL at https://vpm.vlang.io/new
       repo: ${originUrl}
     Once registered the module is installable as:
       v install <repo-owner>.${moduleName}
       (VPM prepends the repo's GitHub owner, e.g. synapticforge1.${moduleName})
  2. UPDATES: there is no per-version upload. Consumers get new code by
       v update <module>
     which pulls the repo. So pushing ${tag} (done by scripts/release.ts) is all
     that "publishing this version" requires once the repo is registered.

Nothing was changed. The pushed ${tag} tag/commit is the published artifact.`);

console.log(`Done: VPM publish is a no-op; ${tag} is already the released state.`);
