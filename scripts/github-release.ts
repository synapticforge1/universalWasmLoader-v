/**
 * Create the GitHub Release page for a tag through GitHub's REST API — never the GitHub CLI
 * (owner, 2026-11-08, workspace letter H30; the page itself: owner, 2026-11-09, workspace row C41).
 * Run by `.github/workflows/release.yml` on a `v*` tag push:
 *
 *   bun scripts/github-release.ts            # create the page (or confirm it exists)
 *   bun scripts/github-release.ts --dry-run  # every check and read, no write
 *
 * Environment:
 *   GITHUB_REPOSITORY  owner/repo                    (set by Actions)
 *   RELEASE_TAG        the tag, e.g. v2.0.1           (github.ref_name)
 *   RELEASE_SHA        the commit the tag push ran on (github.sha)
 *   GITHUB_TOKEN       contents: write — only for the write; reads of this public repo work without
 *   GITHUB_API_URL     default https://api.github.com (a mock in the proof)
 *   GITHUB_API_TIMEOUT_MS  time limit per REST call, default 30000
 *
 * Steps, each refusing with exit 1 on anything unexpected (the order loader-py and loader-go run):
 *   1. The tag must exist on GitHub and peel (annotated tags followed) to RELEASE_SHA:
 *      `POST /releases` CREATES a missing tag, so this check comes first.
 *   2. A page for the tag already exists → done, no write (a re-run is safe).
 *   3. POST it (GitHub-generated notes under a VPM install line), read it back, and check the tag
 *      again.
 *
 * `node:` builtins and `fetch` only; no dependency.
 */
import process from "node:process";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
for (const a of args) if (a !== "--dry-run") fail(`unknown argument "${a}" — use --dry-run or nothing`);

function fail(msg: string): never {
  console.error(`github-release: ${msg}`);
  process.exit(1);
}

function need(name: string): string {
  const v = process.env[name];
  if (!v) fail(`${name} is not set`);
  return v;
}

const repo = need("GITHUB_REPOSITORY");
const tag = need("RELEASE_TAG");
const sha = need("RELEASE_SHA");
const token = process.env.GITHUB_TOKEN ?? "";
const api = (process.env.GITHUB_API_URL || "https://api.github.com").replace(/\/+$/, "");

if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) fail(`GITHUB_REPOSITORY "${repo}" is not owner/repo`);
if (!/^v\d+\.\d+\.\d+$/.test(tag)) fail(`RELEASE_TAG "${tag}" is not a vX.Y.Z tag`);
if (!/^[0-9a-f]{40}$/.test(sha)) fail(`RELEASE_SHA "${sha}" is not a full commit id`);

type Reply = { status: number; json: any; text: string };

/** Time limit for one REST call (GITHUB_API_TIMEOUT_MS overrides it; the proof uses a short one). */
const CALL_MS = Number(process.env.GITHUB_API_TIMEOUT_MS || 30_000);
if (!Number.isInteger(CALL_MS) || CALL_MS <= 0) fail(`GITHUB_API_TIMEOUT_MS "${process.env.GITHUB_API_TIMEOUT_MS}" is not a positive integer`);

async function call(method: string, path: string, body?: unknown): Promise<Reply> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": `${repo} release workflow`,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`${api}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(CALL_MS), // each call its own limit (best-practices 7.21)
    });
  } catch (e) {
    fail(`${method} ${path}: ${(e as Error).message}`);
  }
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

/** The commit the tag peels to on GitHub (annotated tags followed); refuses when it is missing. */
async function peel(): Promise<string> {
  const ref = await call("GET", `/repos/${repo}/git/ref/tags/${tag}`);
  if (ref.status === 404) fail(`tag ${tag} does not exist on GitHub; refusing (a release would create it)`);
  if (ref.status !== 200) fail(`GET tag ref ${tag}: HTTP ${ref.status} ${ref.text.slice(0, 200)}`);
  let object = ref.json?.object as { type: string; sha: string } | undefined;
  for (let depth = 0; object?.type === "tag"; depth++) {
    if (depth > 5) fail(`tag ${tag} nests more than 5 tag objects`);
    const t = await call("GET", `/repos/${repo}/git/tags/${object.sha}`);
    if (t.status !== 200) fail(`GET tag object ${object.sha}: HTTP ${t.status}`);
    object = t.json?.object;
  }
  if (object?.type !== "commit") fail(`tag ${tag} does not point to a commit (${JSON.stringify(object)})`);
  return object.sha;
}

// 1. The tag exists and is the commit this run is for.
const first = await peel();
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
  body: "Install from VPM: `v install synapticforge1.uwl` (VPM resolves this tag from the repository).",
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
if (after !== sha) fail(`tag ${tag} moved to ${after} while the release was made; check it by hand`);
console.log(`GitHub Release ${tag} created: ${back.json?.html_url}`);
