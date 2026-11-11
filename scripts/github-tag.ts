/**
 * Create the release tag on GitHub through the REST API — CI tags, never the owner's machine
 * (owner, 2026-11-10: "CI to check first, then push the tag, and then create the release page from
 * the tag"; workspace letter H33, `release-process.md` § 5 U6). Run by
 * `.github/workflows/release.yml`'s `tag` job, only after `checks` passed on RELEASE_SHA:
 *
 *   bun scripts/github-tag.ts            # create the annotated tag (or confirm it is there)
 *   bun scripts/github-tag.ts --dry-run  # every check and read, no write
 *
 * Environment: see scripts/_github.ts.
 *
 * Steps, each refusing with exit 1 on anything unexpected:
 *   1. The tag already on GitHub: peeling to RELEASE_SHA → done, no write (a re-run is safe);
 *      anywhere else → refuse (a published tag never moves).
 *   2. POST /git/tags (an annotated tag object on RELEASE_SHA), then POST /git/refs.
 *   3. Read it back: the tag must peel to RELEASE_SHA.
 *
 * VPM installs the repository's `main` (measured 2026-11-09), so for VPM users this tag marks the
 * release; the install read-back is the `publish` job's.
 */
import process from "node:process";
import { call, dryRunArg, fail, peel, repo, sha, tag, token } from "./_github.ts";

const dryRun = dryRunArg();

// 1. Already there?
const before = await peel();
if (before !== null) {
  if (before !== sha) fail(`tag ${tag} already exists at ${before}, not ${sha}; refusing (a published tag never moves)`);
  console.log(`tag ${tag} already exists at ${sha}; nothing to do`);
  process.exit(0);
}
console.log(`tag ${tag} is not on GitHub yet`);

// 2. Create.
if (dryRun) {
  console.log(`dry-run: would POST /repos/${repo}/git/tags and /git/refs for ${tag} at ${sha}`);
  process.exit(0);
}
if (!token) fail("GITHUB_TOKEN is not set; cannot create the tag");
const obj = await call("POST", `/repos/${repo}/git/tags`, {
  tag,
  message: `universalWasmLoader-v ${tag}`,
  object: sha,
  type: "commit",
});
if (obj.status !== 201 || !/^[0-9a-f]{40}$/.test(obj.json?.sha ?? "")) {
  fail(`POST tag object ${tag}: HTTP ${obj.status} ${obj.text.slice(0, 200)}`);
}
const ref = await call("POST", `/repos/${repo}/git/refs`, { ref: `refs/tags/${tag}`, sha: obj.json.sha });
if (ref.status !== 201) fail(`POST refs/tags/${tag}: HTTP ${ref.status} ${ref.text.slice(0, 200)}`);

// 3. Read back.
const after = await peel();
if (after !== sha) fail(`read-back of tag ${tag}: peels to ${after ?? "(missing)"}, not ${sha}`);
console.log(`tag ${tag} created (object ${obj.json.sha}) and peels to ${sha}`);
