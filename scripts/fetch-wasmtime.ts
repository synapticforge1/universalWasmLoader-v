// Fetch the wasmtime C API SDK into vendor/ (gitignored). The SDK provides the
// headers (wasm.h / wasmtime.h / wasi.h) and the static/import libraries the
// loader links against.
//
// Usage: bun scripts/fetch-wasmtime.ts [VERSION] [PLATFORM]
//   VERSION  default: 45.0.2
//   PLATFORM default: x86_64-mingw  (gcc/MinGW on Windows; what uwl.v links)
//            other:   x86_64-windows (MSVC)
//
// Only the Windows SDKs ship as .zip; the Linux/macOS ones are .tar.xz, which
// this script does not unpack (the binding's #flag lines link MinGW only).
// Needs nothing but Bun: fetch() downloads, and the .zip is extracted in-process
// (stored + deflate entries).
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { inflateRawSync } from "node:zlib";
import { ROOT } from "./_lib.ts";

function fail(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}

const version = process.argv[2] ?? "45.0.2";
const platform = process.argv[3] ?? "x86_64-mingw";
if (!platform.endsWith("-mingw") && !platform.endsWith("-windows")) {
  fail(`platform ${platform} is not supported: only the Windows SDKs (x86_64-mingw, x86_64-windows) ship as .zip`);
}
const vendor = join(ROOT, "vendor");
const name = `wasmtime-v${version}-${platform}-c-api`;
const url = `https://github.com/bytecodealliance/wasmtime/releases/download/v${version}/${name}.zip`;

try {
  mkdirSync(vendor, { recursive: true });
} catch (e) {
  fail(`cannot create ${vendor}: ${e}`);
}
if (existsSync(join(vendor, name, "include"))) {
  console.log(`wasmtime C API already present: ${join(vendor, name)}`);
  process.exit(0);
}

console.log(`Downloading ${url}`);
let zip: Buffer | undefined;
for (let attempt = 1; attempt < 4; attempt++) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    zip = Buffer.from(await res.arrayBuffer());
    break;
  } catch (e) {
    if (attempt === 3) fail(`download failed: ${e}`);
    console.error(`warning: download attempt ${attempt} failed (${e}); retrying`);
  }
}
console.log("Extracting");
extractZip(zip!, vendor);
console.log(`Done: ${join(vendor, name)}`);

/** Minimal .zip extractor: reads the central directory; stored and deflate only; no ZIP64. */
function extractZip(buf: Buffer, destDir: string): void {
  const root = resolve(destDir);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) fail("cannot extract: downloaded file is not a zip archive");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || p === 0xffffffff) fail("cannot extract: ZIP64 archives are not supported");

  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) fail("cannot extract: corrupt zip central directory");
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const entry = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    const out = resolve(root, entry);
    if (!out.startsWith(root + sep)) fail(`cannot extract: unsafe path in archive: ${entry}`);
    if (entry.endsWith("/")) {
      mkdirSync(out, { recursive: true });
      continue;
    }
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + csize);
    let data: Buffer;
    if (method === 0) data = raw;
    else if (method === 8) data = inflateRawSync(raw);
    else fail(`cannot extract: unsupported compression method ${method} for ${entry}`);
    if (data.length !== usize) fail(`cannot extract: size mismatch for ${entry}`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, data);
  }
}
