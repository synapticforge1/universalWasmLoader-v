// The public SURFACE of the `uwl` module (workspace compatibility gate, Rule 1).
//
// Usage: bun scripts/surface.ts           write api-surface.txt
//        bun scripts/surface.ts --check   exit 1 if api-surface.txt is stale
//
// The symbols come from `v doc -f json` over uwl/ (what V itself reports as
// public), one line each: functions and methods as parameter TYPES + return type
// (V has no named arguments, so a parameter's name is not surface), structs with
// their `pub` fields only. A symbol kind this script cannot key is an error,
// never skipped. The SPEC version comes from the vendored header's leading
// comment, exactly once.
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { die, help, ROOT } from "./_lib.ts";

export const MODULE_DIR = "uwl";
export const HEADER = "uwl/universal_wasm_loader.h";
export const SNAPSHOT = "api-surface.txt";

/** key -> full line; `spec` is the SPEC version. */
export type Surface = { spec: string; symbols: Map<string, string> };

const GUARD = "#define UNIVERSAL_WASM_LOADER_H";

/** The SPEC version from the header's leading comment (not the implementation's comments). */
export function specOf(header: string): string {
  const lead = header.slice(0, Math.max(0, header.indexOf(GUARD)));
  const specs = [...lead.matchAll(/SPEC v(\d+\.\d+\.\d+)/g)].map((m) => m[1]);
  if (specs.length !== 1) {
    throw new Error(`the header's leading comment must state its SPEC version once ("SPEC vX.Y.Z"); found ${specs.length}`);
  }
  return specs[0];
}

/** Split on commas at bracket depth 0. */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if ("([{".includes(ch)) depth++;
    if (")]}".includes(ch)) depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** `mut name T` -> `mut T`; `name T` -> `T`; `name ...T` -> `...T`. */
function paramType(p: string): string {
  const m = p.match(/^(mut\s+|shared\s+)?[A-Za-z_]\w*\s+(.+)$/);
  if (!m) throw new Error(`cannot read parameter: ${p}`);
  return `${m[1] ?? ""}${m[2].trim()}`;
}

/** `fn (m &Module) call(name string, args ...Arg) !int` -> `fn (&Module) call(string, ...Arg) !int`. */
function signature(content: string): string {
  const m = content.match(/^fn\s+(?:\(([^)]*)\)\s+)?([\w.]+)(\[[^\]]*\])?\((.*)\)\s*(.*)$/s);
  if (!m) throw new Error(`cannot read function signature: ${content}`);
  const recv = m[1] !== undefined ? `(${paramType(m[1].trim())}) ` : "";
  const params = splitTop(m[4]).map(paramType).join(", ");
  return `fn ${recv}${m[2]}${m[3] ?? ""}(${params})${m[5] ? ` ${m[5].trim()}` : ""}`;
}

/** The `pub:` / `pub mut:` fields of a struct, comments and alignment dropped. */
function pubFields(content: string): string[] {
  const out: string[] = [];
  let section = "";
  for (const raw of content.split("\n").slice(1, -1)) {
    const line = raw.replace(/\/\/.*$/, "").trim();
    if (!line) continue;
    const s = line.match(/^(pub mut|pub|mut|__global):$/);
    if (s) { section = s[1]; continue; }
    if (section.startsWith("pub")) out.push(`${section === "pub mut" ? "mut " : ""}${line.replace(/\s+/g, " ")}`);
  }
  return out;
}

type DocNode = { kind: string; name: string; public: boolean; content: string; children?: DocNode[] };

/** Surface lines from `v doc -f json` output. */
export function fromDoc(doc: { contents: DocNode[] }): Map<string, string> {
  const symbols = new Map<string, string>();
  const add = (key: string, line: string) => {
    if (symbols.has(key)) throw new Error(`duplicate surface key: ${key}`);
    symbols.set(key, line);
  };
  const visit = (n: DocNode, parent: string) => {
    if (!n.public) return;
    const content = n.content.replace(/\r\n/g, "\n");
    switch (n.kind) {
      case "function":
        add(`fn ${n.name}`, signature(content));
        break;
      case "method":
        add(`fn ${parent}.${n.name}`, signature(content));
        break;
      case "struct":
        add(`struct ${n.name}`, `struct ${n.name} {${pubFields(content).map((f) => ` ${f};`).join("")} }`);
        break;
      case "const":
      case "enum":
      case "typedef":
      case "interface":
      case "sum_type":
      case "alias":
        add(`${n.kind} ${n.name}`, content.replace(/\/\/.*$/gm, "").replace(/\s+/g, " ").trim());
        break;
      default:
        throw new Error(`cannot key a public '${n.kind}' (${n.name}); teach scripts/surface.ts this kind`);
    }
    for (const c of n.children ?? []) visit(c, n.name);
  };
  for (const n of doc.contents) visit(n, "");
  return new Map([...symbols].sort(([a], [b]) => a.localeCompare(b)));
}

/** `const X…` -> `const X`; the key is everything before the first `(`, ` {`, ` =` or `: `. */
function keyOf(line: string): string {
  const m = line.match(/^fn (?:\([^)]*\) )?([\w.]+)/);
  if (m) {
    const recv = line.match(/^fn \((?:mut |shared )?&?([\w.]+)\)/);
    return recv ? `fn ${recv[1]}.${m[1]}` : `fn ${m[1]}`;
  }
  const s = line.match(/^(\w+) ([\w.]+)/);
  if (!s) throw new Error(`cannot key surface line: ${line}`);
  return `${s[1]} ${s[2]}`;
}

export function parse(text: string): Surface {
  let spec = "";
  const symbols = new Map<string, string>();
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    if (line === "" || line.startsWith("#")) continue;
    if (line.startsWith("spec ")) { spec = line.slice(5); continue; }
    const key = keyOf(line);
    if (symbols.has(key)) throw new Error(`duplicate surface key: ${key}`);
    symbols.set(key, line);
  }
  if (!spec) throw new Error("surface has no spec line");
  return { spec, symbols };
}

export function serialize(s: Surface): string {
  const head = "# Public surface of the `uwl` module. Generated by scripts/surface.ts; do not edit by hand.\n" +
    "# Re-baseline in its own commit.\n";
  return `${head}spec ${s.spec}\n${[...s.symbols.values()].join("\n")}\n`;
}

/** Run `v doc -f json` over a module directory (relative to the repo root) and build its surface. */
export function generate(moduleDir = MODULE_DIR, header = readFileSync(join(ROOT, HEADER), "utf8")): Surface {
  const p = Bun.spawnSync(["v", "doc", "-f", "json", "-no-timestamp", "-o", "stdout", moduleDir], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) throw new Error(`v doc ${moduleDir} failed:\n${p.stderr.toString()}`);
  const doc = JSON.parse(p.stdout.toString());
  if (doc.module_name !== "uwl") throw new Error(`v doc ${moduleDir} reported module '${doc.module_name}', not 'uwl'`);
  const symbols = fromDoc(doc);
  if (symbols.size === 0) throw new Error(`v doc ${moduleDir} reported no public symbols`);
  // Round-trip through the text form so a key computed here always equals the key read back.
  return parse(serialize({ spec: specOf(header), symbols }));
}

export function readSnapshot(): Surface {
  return parse(readFileSync(join(ROOT, SNAPSHOT), "utf8"));
}

/** Key-level difference, for messages and the floor. */
export function diffSurface(a: Surface, b: Surface): string[] {
  const out: string[] = [];
  if (a.spec !== b.spec) out.push(`spec: ${a.spec} -> ${b.spec}`);
  for (const [k, v] of a.symbols) {
    if (!b.symbols.has(k)) out.push(`removed: ${v}`);
    else if (b.symbols.get(k) !== v) out.push(`changed: ${v} -> ${b.symbols.get(k)}`);
  }
  for (const [k, v] of b.symbols) if (!a.symbols.has(k)) out.push(`added: ${v}`);
  return out;
}

const USAGE = `
Write or check api-surface.txt, the public surface of the \`uwl\` module.

Usage: bun scripts/surface.ts [--check]
  --check     Exit 1 if api-surface.txt differs from the current surface.
  -h, --help  Show this help.

An intended surface change is re-baselined (no --check) in its OWN commit.
`;

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.includes("-h") || args.includes("--help")) help(USAGE);
  for (const a of args) if (a !== "--check") die(2, `unknown argument: ${a}`);

  const current = generate();
  if (args.includes("--check")) {
    let committed: Surface;
    try {
      committed = readSnapshot();
    } catch (e) {
      die(1, `${SNAPSHOT} missing or unreadable (${e}); run: bun scripts/surface.ts`);
    }
    const diff = diffSurface(committed, current);
    if (diff.length > 0) {
      console.error(`${SNAPSHOT} is stale against the module:`);
      for (const l of diff) console.error(`  ${l}`);
      die(1, "if the change is intended, re-baseline in its OWN commit: bun scripts/surface.ts");
    }
    console.log(`${SNAPSHOT} current: ${current.symbols.size} symbols, SPEC ${current.spec}`);
  } else {
    const path = join(ROOT, SNAPSHOT);
    writeFileSync(`${path}.tmp`, serialize(current));
    renameSync(`${path}.tmp`, path);
    console.log(`wrote ${SNAPSHOT}: ${current.symbols.size} symbols, SPEC ${current.spec}`);
  }
}
