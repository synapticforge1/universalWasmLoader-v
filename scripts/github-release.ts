/**
 * Create the GitHub Release page FROM the tag through GitHub's REST API — never the GitHub CLI
 * (H30; the page: owner, 2026-11-09, H32 / C41; the order: owner, 2026-11-10, H33 — checks, then
 * the tag, then this page, then the publish). Run by `.github/workflows/release.yml`'s `release`
 * job, after the `tag` job:
 *
 *   bun scripts/github-release.ts            # create the page (or confirm it exists)
 *   bun scripts/github-release.ts --dry-run  # every check and read, no write
 *
 * Environment: see scripts/_github.ts.
 *
 * Steps, each refusing with exit 1 on anything unexpected (H32's order):
 *   1. The tag must exist on GitHub and peel (annotated tags followed) to RELEASE_SHA:
 *      `POST /releases` CREATES a missing tag, so this check comes first.
 *   2. A page for the tag already exists → done, no write (a re-run is safe).
 *   3. POST it (GitHub-generated notes under a VPM install line), read it back, and check the tag
 *      again.
 */
import process from "node:process";
import { call, dryRunArg, fail, peel, repo, sha, tag, token } from "./_github.ts";

const dryRun = dryRunArg();

// 1. The tag exists and is the commit this run is for.
const first = await peel();
if (first === null) fail(`tag ${tag} does not exist on GitHub; refusing (a release would create it — the tag job makes it)`);
if (first !== sha) fail(`tag ${tag} is ${first}, this run is for ${sha}; refusing`);
console.log(`tag ${tag} = ${sha}`);

// 2. An existing page means done.
const existing = await call("GET", `/repos/${repo}/releases/tags/${tag}`);
if (existing.status === 200) {
  console.log(`GitHub Release ${tag} already exists: ${existing.json?.html_url}`);
  process.exit(0);
}
if (existing.status !== 404) fail(`GET release ${tag}: HTTP ${existing.status} ${existing.text.slice(0, 200)}`);

// 3. Create, read back, re-check the tag.
const body = {
  tag_name: tag,
  name: tag,
  body: `Install from VPM: \`v install synapticforge1.uwl\` — VPM installs the repository's \`main\`; this tag marks ${tag} on it.`,
  generate_release_notes: true,
  draft: false,
  prerelease: false,
};
if (dryRun) {
  console.log(`dry-run: would POST /repos/${repo}/releases for ${tag}`);
  process.exit(0);
}
if (!token) fail("GITHUB_TOKEN is not set; cannot write the release");
const made = await call("POST", `/repos/${repo}/releases`, body);
if (made.status !== 201) fail(`POST release ${tag}: HTTP ${made.status} ${made.text.slice(0, 200)}`);
const back = await call("GET", `/repos/${repo}/releases/tags/${tag}`);
if (back.status !== 200 || back.json?.tag_name !== tag || back.json?.draft !== false) {
  fail(`read-back of release ${tag}: HTTP ${back.status}, tag ${back.json?.tag_name}, draft ${back.json?.draft}`);
}
const after = await peel();
if (after !== sha) fail(`tag ${tag} moved to ${after ?? "(missing)"} while the release was made; check it by hand`);
console.log(`GitHub Release ${tag} created: ${back.json?.html_url}`);
