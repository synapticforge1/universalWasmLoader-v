#!/usr/bin/env -S v

// Fetch the wasmtime C API SDK into vendor/ (gitignored). The SDK provides the
// headers (wasm.h / wasmtime.h / wasi.h) and the static/import libraries the
// loader links against.
//
// Usage: v run scripts/fetch-wasmtime.vsh [VERSION] [PLATFORM]
//   VERSION  default: 45.0.2
//   PLATFORM default: x86_64-mingw  (gcc/MinGW on Windows; what uwl.v links)
//            other:   x86_64-windows (MSVC)
//
// Only the Windows SDKs ship as .zip; the Linux/macOS ones are .tar.xz, which
// this script does not unpack (the binding's #flag lines link MinGW only).
import os
import net.http
import compress.szip

@[noreturn]
fn fail(msg string) {
	eprintln('error: ${msg}')
	exit(1)
}

version := if os.args.len > 1 { os.args[1] } else { '45.0.2' }
platform := if os.args.len > 2 { os.args[2] } else { 'x86_64-mingw' }
if !platform.ends_with('-mingw') && !platform.ends_with('-windows') {
	fail('platform ${platform} is not supported: only the Windows SDKs (x86_64-mingw, x86_64-windows) ship as .zip')
}
here := os.dir(os.dir(os.real_path(@FILE)))
vendor := os.join_path(here, 'vendor')
name := 'wasmtime-v${version}-${platform}-c-api'
url := 'https://github.com/bytecodealliance/wasmtime/releases/download/v${version}/${name}.zip'

os.mkdir_all(vendor) or { fail('cannot create ${vendor}: ${err}') }
if os.is_dir(os.join_path(vendor, name, 'include')) {
	println('wasmtime C API already present: ${os.join_path(vendor, name)}')
	exit(0)
}

zip := os.join_path(vendor, '${name}.zip')
println('Downloading ${url}')
for attempt in 1 .. 4 {
	http.download_file(url, zip) or {
		if attempt == 3 {
			fail('download failed: ${err}')
		}
		eprintln('warning: download attempt ${attempt} failed (${err}); retrying')
		continue
	}
	break
}
println('Extracting')
extracted := szip.extract_zip_to_dir(zip, vendor) or { fail('cannot extract ${zip}: ${err}') }
if !extracted {
	fail('cannot extract ${zip}')
}
os.rm(zip) or { eprintln('warning: could not remove ${zip}: ${err}') }
println('Done: ${os.join_path(vendor, name)}')
