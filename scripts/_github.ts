// Shared GitHub REST helpers for the release workflow's scripts (run with Bun; not a script itself).
// GitHub's REST API with GITHUB_TOKEN — never the GitHub CLI (workspace H30). Every call has its
// own time limit (workspace best-practices 7.21).
//
// Environment (read once, validated):
//   GITHUB_REPOSITORY      owner/repo                (set by Actions)
//   RELEASE_TAG            the tag, e.g. v2.0.3
//   RELEASE_SHA            the commit `checks` passed (full id)
//   GITHUB_TOKEN           only for writes; reads of this public repo work without
//   GITHUB_API_URL         default https://api.github.com (a mock in the proofs)
//   GITHUB_API_TIMEOUT_MS  time limit per call, default 30000
import process from "node:process";

export function fail(msg: string): never {
  console.error(`${process.argv[1]?.split(/[\\/]/).pop() ?? "github"}: ${msg}`);
  process.exit(1);
}

function need(name: string): string {
  const v = process.env[name];
  if (!v) fail(`${name} is not set`);
  return v;
}

export const repo = need("GITHUB_REPOSITORY");
export const tag = need("RELEASE_TAG");
export const sha = need("RELEASE_SHA");
export const token = process.env.GITHUB_TOKEN ?? "";
const api = (process.env.GITHUB_API_URL || "https://api.github.com").replace(/\/+$/, "");
const CALL_MS = Number(process.env.GITHUB_API_TIMEOUT_MS || 30_000);

if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) fail(`GITHUB_REPOSITORY "${repo}" is not owner/repo`);
if (!/^v\d+\.\d+\.\d+$/.test(tag)) fail(`RELEASE_TAG "${tag}" is not a vX.Y.Z tag`);
if (!/^[0-9a-f]{40}$/.test(sha)) fail(`RELEASE_SHA "${sha}" is not a full commit id`);
if (!Number.isInteger(CALL_MS) || CALL_MS <= 0) fail(`GITHUB_API_TIMEOUT_MS "${process.env.GITHUB_API_TIMEOUT_MS}" is not a positive integer`);

/** Parse `--dry-run` (the only argument any of these scripts takes). */
export function dryRunArg(): boolean {
  const args = process.argv.slice(2);
  for (const a of args) if (a !== "--dry-run") fail(`unknown argument "${a}" — use --dry-run or nothing`);
  return args.includes("--dry-run");
}

export type Reply = { status: number; json: any; text: string };

/** One REST call with its own time limit; a network error or the limit is fatal. */
export async function call(method: string, path: string, body?: unknown): Promise<Reply> {
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
      signal: AbortSignal.timeout(CALL_MS),
    });
  } catch (e) {
    fail(`${method} ${path}: ${(e as Error).message}`);
  }
  let text: string;
  try {
    text = await res.text();
  } catch (e) {
    fail(`${method} ${path}: reading the body: ${(e as Error).message}`);
  }
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

/** The commit the tag peels to on GitHub (annotated tags followed), or null when it does not exist. */
export async function peel(): Promise<string | null> {
  const ref = await call("GET", `/repos/${repo}/git/ref/tags/${tag}`);
  if (ref.status === 404) return null;
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
