// zigcc: use `zig cc` as V's C compiler. V's default tcc cannot link wasmtime.
//
// Build it once, then hand the binary to V:
//
//     v -o scripts/zigcc scripts/zigcc.v
//     v -cc "$(pwd -W)/scripts/zigcc.exe" run examples/adder.v
//
// V passes its flags in a response file (cc @file.rsp) and hardcodes
// `-Wl,-stack=...`, which zig's bundled lld rejects. We rewrite the response
// file to drop that one flag (zig's default stack size is fine) and force the
// MinGW-GNU target so the wasmtime GNU import library links. Every other
// argument is passed to zig unchanged; os.Process re-quotes each one, so a
// path like `-I"C:\dir with spaces"` survives intact.
module main

import os

const stack_flag = '-Wl,-stack='

fn main() {
	mut args := ['cc', '-target', 'x86_64-windows-gnu']
	for a in os.args[1..] {
		if a.starts_with('@') && a.ends_with('.rsp') {
			rsp := a[1..]
			filtered := rsp + '.zig.rsp'
			text := os.read_file(rsp) or { fail('cannot read ${rsp}: ${err}') }
			os.write_file(filtered, strip_stack_flag(text)) or {
				fail('cannot write ${filtered}: ${err}')
			}
			args << '@' + filtered
		} else if strip_stack_flag(a) != '' {
			args << a
		}
	}
	zig := os.find_abs_path_of_executable('zig') or { fail('zig not found on PATH') }
	mut p := os.new_process(zig)
	p.set_args(args)
	p.run()
	p.wait()
	code := p.code
	p.close()
	exit(code)
}

// strip_stack_flag removes every `-Wl,-stack=<digits>` from `s`.
fn strip_stack_flag(s string) string {
	mut out := s
	for {
		i := out.index(stack_flag) or { break }
		mut j := i + stack_flag.len
		for j < out.len && out[j].is_digit() {
			j++
		}
		out = out[..i] + out[j..]
	}
	return out
}

@[noreturn]
fn fail(msg string) {
	eprintln('zigcc: ${msg}')
	exit(1)
}
