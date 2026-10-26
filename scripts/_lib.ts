// Shared helpers for the scripts in this directory (run with Bun; not a script itself).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Repo root (this file lives in scripts/). Every script chdirs here first. */
export const ROOT = resolve(import.meta.dir, "..");

export function die(code: number, msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(code);
}

/** Run a command without a shell; return its exit code and trimmed stdout (127 if not on PATH). */
export function capture(args: string[]): { code: number; out: string } {
  const exe = Bun.which(args[0]);
  if (!exe) return { code: 127, out: "" };
  const p = Bun.spawnSync([exe, ...args.slice(1)], { stdout: "pipe", stderr: "pipe" });
  return { code: p.exitCode ?? 1, out: p.stdout.toString().trim() };
}

/** Echo `+ cmd`, then (unless dryRun) run it with inherited stdio; a failure exits with its code. */
export function run(dryRun: boolean, args: string[]): void {
  console.log(`+ ${args.join(" ")}`);
  if (dryRun) return;
  const exe = Bun.which(args[0]);
  if (!exe) die(127, `${args[0]} not found on PATH`);
  const code = Bun.spawnSync([exe, ...args.slice(1)], { stdio: ["inherit", "inherit", "inherit"] }).exitCode;
  if (code !== 0) process.exit(code ?? 1);
}

export const has = (tool: string): boolean => Bun.which(tool) !== null;

// --- v.mod: the single source of truth for the version ----------------------
export const MOD_FILE = "v.mod";

/** Start and end of the first single-quoted value after `<key>:` in v.mod text. */
export function fieldSpan(text: string, key: string): [number, number] | null {
  const k = text.indexOf(`${key}:`);
  if (k < 0) return null;
  const q1 = text.indexOf("'", k);
  if (q1 < 0) return null;
  const q2 = text.indexOf("'", q1 + 1);
  if (q2 < 0) return null;
  return [q1 + 1, q2];
}

/** The first single-quoted value after `<key>:` in v.mod text, or "". */
export function modField(text: string, key: string): string {
  const span = fieldSpan(text, key);
  return span ? text.slice(span[0], span[1]) : "";
}

export function readMod(): string {
  try {
    return readFileSync(MOD_FILE, "utf8");
  } catch {
    return "";
  }
}

// --- git --------------------------------------------------------------------
export const porcelain = (): string => capture(["git", "status", "--porcelain"]).out;

export const tagExists = (tag: string): boolean =>
  capture(["git", "rev-parse", "-q", "--verify", `refs/tags/${tag}`]).code === 0;

/** Print usage and exit 0. */
export function help(usage: string): never {
  console.log(usage.trim());
  process.exit(0);
}
