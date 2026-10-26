// Run the V test suite (SPEC §8 over the stamped reference fixtures).
//
// Usage: bun scripts/test.ts [DIR]   DIR defaults to tests/ (the compatibility
//                                    gate passes a previous tag's tests/ here)
//
// V's default tcc cannot link wasmtime: if VFLAGS selects no C compiler, the
// zigcc tool is built from scripts/zigcc.v on first use and passed as -cc. The
// SDK's lib/ goes on PATH so the test binary finds wasmtime.dll. The verdict is
// read from V's OUTPUT (the per-file summary) as well as its exit code.
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import { die, help, ROOT } from "./_lib.ts";

/** Must match the SDK the `#flag` lines in uwl/uwl.v link. */
export const SDK = join(ROOT, "vendor", "wasmtime-v45.0.2-x86_64-mingw-c-api");

export type TestResult = { ok: boolean; passed: number; failed: number; exitCode: number; output: string };

/** The `-cc` arguments for `v`: none when VFLAGS already picks one, else the zigcc tool. */
export function ccArgs(): string[] {
  if ((process.env.VFLAGS ?? "").includes("-cc")) return [];
  if (!Bun.which("zig")) return [];
  const zigcc = join(ROOT, "scripts", process.platform === "win32" ? "zigcc.exe" : "zigcc");
  if (!existsSync(zigcc)) {
    const b = Bun.spawnSync(["v", "-o", zigcc, join(ROOT, "scripts", "zigcc.v")], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
    if (b.exitCode !== 0) throw new Error(`building zigcc failed:\n${b.stderr.toString()}`);
  }
  return ["-cc", zigcc];
}

/** Run `v test` over `dir` (relative to the repo root) and read the verdict from its output. */
export function runTests(dir = "tests"): TestResult {
  if (!existsSync(join(SDK, "include"))) {
    throw new Error(`wasmtime C API not found at ${SDK}; run: bun scripts/fetch-wasmtime.ts`);
  }
  const env = { ...process.env, PATH: `${join(SDK, "lib")}${delimiter}${process.env.PATH ?? ""}` };
  const p = Bun.spawnSync(["v", ...ccArgs(), "-stats", "test", dir], { cwd: ROOT, env, stdout: "pipe", stderr: "pipe" });
  const output = p.stdout.toString() + p.stderr.toString();
  // One line per _test.v file: `Summary for running V tests in "x_test.v": [N failed, ]M passed, T total.`
  let passed = 0;
  let failed = 0;
  let files = 0;
  for (const m of output.matchAll(/Summary for running V tests in "[^"]+": (?:(\d+) failed, )?(\d+) passed, (\d+) total\./g)) {
    files++;
    failed += Number(m[1] ?? 0);
    passed += Number(m[2]);
  }
  const exitCode = p.exitCode ?? 1;
  return { ok: exitCode === 0 && files > 0 && failed === 0 && passed > 0, passed, failed, exitCode, output };
}

const USAGE = `
Run the V test suite (default tests/) with a C compiler that can link wasmtime.

Usage: bun scripts/test.ts [DIR]
  -h, --help  Show this help.
`;

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.includes("-h") || args.includes("--help")) help(USAGE);
  if (args.length > 1 || args.some((a) => a.startsWith("-"))) die(2, `unexpected arguments: ${args.join(" ")}`);
  process.chdir(ROOT);
  let r: TestResult;
  try {
    r = runTests(args[0] ?? "tests");
  } catch (e) {
    die(1, `${e instanceof Error ? e.message : e}`);
  }
  console.log(r.output.trimEnd());
  console.log(`${r.ok ? "GREEN" : "RED"}: ${r.passed} asserts passed, ${r.failed} failed, exit ${r.exitCode}`);
  process.exit(r.ok ? 0 : 1);
}
