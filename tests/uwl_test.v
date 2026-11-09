// Reference test suite (SPEC §8) for the V binding: `bun scripts/test.ts`.
//
// The fixtures in this directory are the workspace's stamped reference set,
// copied unmodified from universalWasmLoader-js (see fixtures.json); the first
// test proves every byte still matches that stamp. Paths are relative to this
// file, so a previous tag's tests/ run from anywhere with its own fixtures.
module main

import os
import json
import math
import crypto.sha256
import uwl

const dir = os.dir(@FILE)

fn fixture(name string) string {
	return os.join_path(dir, name)
}

struct Stamp {
	files map[string]string
}

fn test_fixtures_match_the_stamp() {
	stamp := json.decode(Stamp, os.read_file(fixture('fixtures.json'))!)!
	assert stamp.files.len == 12
	for name, want in stamp.files {
		got := sha256.sum(os.read_bytes(fixture(name))!).hex()
		assert got == want, name
	}
	// Same set both ways: nothing here is unlisted.
	for name in os.ls(dir)! {
		if name == 'fixtures.json' || name.ends_with('.v') {
			continue
		}
		assert name in stamp.files, '${name} is not listed in fixtures.json'
	}
}

fn test_math_50_numeric_round_trip() {
	m := uwl.import_module(fixture('math_50.wasm'))!
	defer {
		m.free()
	}
	assert m.call_i32('add', uwl.i32(3), uwl.i32(4))! == 7
	assert math.abs(m.call_f64('multiply', uwl.f64(2.5), uwl.f64(4.0))! - 10.0) < 1e-9
	assert m.call_i32('square', uwl.i32(5))! == 25
}

fn test_booleans_50_bool_normalization() {
	m := uwl.import_module(fixture('booleans_50.wasm'))!
	defer {
		m.free()
	}
	assert m.call_bool('isPositive', uwl.f64(1.0))!
	assert !m.call_bool('isPositive', uwl.f64(-1.0))!
	assert m.call_bool('inRange', uwl.f64(5.0), uwl.f64(0.0), uwl.f64(10.0))!
	assert !m.call_bool('inRange', uwl.f64(11.0), uwl.f64(0.0), uwl.f64(10.0))!
	assert m.call_bool('isEven', uwl.i32(4))!
	assert !m.call_bool('isEven', uwl.i32(3))!
}

fn test_strings_50_string_param_and_return() {
	m := uwl.import_module(fixture('strings_50.wasm'))!
	defer {
		m.free()
	}
	assert m.call_str('greet', uwl.text('World'))! == 'Hello, World!'
	assert m.call_str('shout', uwl.text('hi'))! == 'hihi'
	assert m.call_i32('strLen', uwl.text('hello'))! == 5
}

// init_check.wasm has no .wit (raw-exports path); its `_initialize` sets a
// global to 99 that `getValue` reads, so 99 proves the loader invoked it.
fn test_init_check_initialize_runs_after_instantiation() {
	m := uwl.import_module(fixture('init_check.wasm'))!
	defer {
		m.free()
	}
	assert m.call_i32('getValue')! == 99
}

// wasi_io_50 imports wasi_snapshot_preview1.fd_write; without the loader's WASI
// context the call would trap, so the result is the evidence.
fn test_wasi_io_50_wasi_lets_an_io_library_instantiate() {
	m := uwl.import_module(fixture('wasi_io_50.wasm'))!
	defer {
		m.free()
	}
	assert m.call_i32('logAndDouble', uwl.i32(21))! == 42
}

// --- SPEC 4.0.0 § 8 "Refusals" ------------------------------------------------
// Rows needing a host callback (only envMul, callback results, async) and the
// http rows are n/a here: the loader reads local files only (and a V callback
// cannot return a promise: async is n/a too). Variant `.wit` files go in a scratch directory beside a COPY of a
// fixture `.wasm`, so tests/ and its stamp are never touched.

// load_error loads `path` and returns the loader's message ('' if it loaded).
fn load_error(path string) string {
	if m := uwl.import_module(path) {
		m.free()
		return ''
	} else {
		return err.msg()
	}
}

// scratch makes an empty scratch directory for one test; remove it with os.rmdir_all.
fn scratch(name string) string {
	d := os.join_path(os.temp_dir(), 'uwl_v_${os.getpid()}_${name}')
	os.rmdir_all(d) or {}
	os.mkdir_all(d) or { panic(err) }
	return d
}

// beside writes `wit` (unless it is '') as `<base>.wit` next to a copy of the
// fixture `<base>.wasm` in `d`, and returns the copy's path.
fn beside(d string, base string, wit string) string {
	wasm := os.join_path(d, '${base}.wasm')
	os.cp(fixture('${base}.wasm'), wasm) or { panic(err) }
	if wit != '' {
		os.write_file(os.join_path(d, '${base}.wit'), wit) or { panic(err) }
	}
	return wasm
}

const math_wit = 'package local:math-50;\n\nworld math-50 {\n  export add: func(a: s32, b: s32) -> s32;\n  export multiply: func(a: f64, b: f64) -> f64;\n  export square: func(x: s32) -> s32;\n}\n'

// § 4: every WIT import needs a host callback; import_module passes none, so
// imports_50 is refused at load naming both (SPEC 3.0.0 loaded it and read zeros).
fn test_imports_50_without_host_callbacks_fails_naming_both() {
	msg := load_error(fixture('imports_50.wasm'))
	assert msg.contains('envMul'), msg
	assert msg.contains('envAdd'), msg
}

// § 4: a `string`-result import fails the load before the `.wasm` is read. Both
// callbacks are given, so the string-result refusal is the one reported; no
// `.wasm` exists, so a message about reading it would mean the order broke.
fn test_a_string_result_import_fails_before_the_wasm_is_read() {
	d := scratch('strimport')
	defer {
		os.rmdir_all(d) or {}
	}
	os.write_file(os.join_path(d, 'imports_50.wit'),
		'world imports-50 {\n  import env-mul: func(p0: f64, p1: f64) -> string;\n  export scale: func(x: f64, factor: f64) -> f64;\n}\n')!
	if m := uwl.import_module_with(os.join_path(d, 'imports_50.wasm'), imports_50_callbacks()) {
		m.free()
		assert false, 'a string-result import loaded'
	} else {
		assert err.msg() == 'a WIT import returning a string is not supported: envMul (WIT "env-mul")', err.msg()
	}
}

// § 4 typed-call arguments: count and kinds checked by the C loader, no coercion;
// each message names the export and the parameter (or the count).
fn test_typed_call_arguments_are_refused_naming_export_and_parameter() {
	m := uwl.import_module(fixture('math_50.wasm'))!
	defer {
		m.free()
	}
	cases := [
		[uwl.text('x'), uwl.i32(1)],
		[uwl.f64(2.7), uwl.i32(1)],
		[uwl.i32(1), uwl.i64(2147483648)], // 2**31, one past s32; only an s64 Arg can hold it
	]
	params := ["'a'", "'a'", "'b'"]
	for idx, args in cases {
		if _ := m.call_i32('add', ...args) {
			assert false, 'add case ${idx} accepted'
		} else {
			assert err.msg().contains("export 'add'"), err.msg()
			assert err.msg().contains(params[idx]), err.msg()
		}
	}
	if _ := m.call_i32('add', uwl.i32(1)) {
		assert false, 'add(1) accepted'
	} else {
		assert err.msg().contains("export 'add' expects 2 args, got 1"), err.msg()
	}
	s := uwl.import_module(fixture('strings_50.wasm'))!
	defer {
		s.free()
	}
	if _ := s.call_str('greet', uwl.i32(42)) {
		assert false, 'greet(42) accepted'
	} else {
		assert err.msg().contains("export 'greet' parameter 'name'"), err.msg()
	}
	b := uwl.import_module(fixture('booleans_50.wasm'))!
	defer {
		b.free()
	}
	if _ := b.call_bool('isEven', uwl.text('4')) {
		assert false, 'isEven("4") accepted'
	} else {
		assert err.msg().contains("export 'isEven' parameter 'n'"), err.msg()
	}
}

// § 4: a kind-specific accessor refuses a result of another kind, never a zero
// value (SPEC 3.0.0's binding returned 0 / 0.0 / false / '' here).
fn test_a_result_kind_mismatch_is_refused() {
	m := uwl.import_module(fixture('math_50.wasm'))!
	defer {
		m.free()
	}
	if _ := m.call_i32('multiply', uwl.f64(2.5), uwl.f64(4.0)) {
		assert false, 'call_i32 on an f64 export returned a value'
	} else {
		assert err.msg() == "export 'multiply' returns f64, not s32", err.msg()
	}
	if _ := m.call_f64('add', uwl.i32(3), uwl.i32(4)) {
		assert false, 'call_f64 on an s32 export returned a value'
	} else {
		assert err.msg() == "export 'add' returns s32, not f64", err.msg()
	}
	if _ := m.call_f32('multiply', uwl.f64(2.5), uwl.f64(4.0)) {
		assert false, 'call_f32 on an f64 export returned a value'
	} else {
		assert err.msg() == "export 'multiply' returns f64, not f32", err.msg()
	}
	if _ := m.call_i64('add', uwl.i32(3), uwl.i32(4)) {
		assert false, 'call_i64 on an s32 export returned a value'
	} else {
		assert err.msg() == "export 'add' returns s32, not s64", err.msg()
	}
	if _ := m.call_bool('square', uwl.i32(5)) {
		assert false, 'call_bool on an s32 export returned a value'
	} else {
		assert err.msg() == "export 'square' returns s32, not bool", err.msg()
	}
	if _ := m.call_str('add', uwl.i32(3), uwl.i32(4)) {
		assert false, 'call_str on an s32 export returned a value'
	} else {
		assert err.msg() == "export 'add' returns s32, not string", err.msg()
	}
	// call_void discards the result, so it never refuses a kind.
	m.call_void('add', uwl.i32(3), uwl.i32(4))!
}

// § 2 parsing: a `.wit` that does not parse, or uses a type outside the table,
// fails the load naming the `.wit` and the fault (`u32` is never read as s32).
fn test_a_wit_that_does_not_parse_fails_naming_it() {
	d := scratch('badwit')
	defer {
		os.rmdir_all(d) or {}
	}
	faults := {
		'func(a: s32 b: s32)':  'malformed parameter'
		'func(a: u32, b: s32)': 'unsupported WIT type "u32"'
	}
	for sig, fault in faults {
		wasm := beside(d, 'math_50', math_wit.replace('func(a: s32, b: s32)', sig))
		msg := load_error(wasm)
		assert msg.contains("invalid .wit '"), msg
		assert msg.contains('math_50.wit'), msg
		assert msg.contains(fault), msg
	}
}

// § 2: a WIT export the module lacks fails the load, naming it.
fn test_a_wit_export_the_module_lacks_fails_naming_it() {
	d := scratch('noexport')
	defer {
		os.rmdir_all(d) or {}
	}
	wasm := beside(d, 'math_50',
		math_wit.replace('}\n', '  export cube: func(x: s32) -> s32;\n}\n'))
	msg := load_error(wasm)
	assert msg.contains('does not export'), msg
	assert msg.contains('cube'), msg
}

// § 2 absent versus failed: a `.wit` that exists but cannot be read (here a
// directory) fails the load naming it; only an ABSENT `.wit` gives raw exports.
fn test_only_an_absent_wit_gives_raw_exports() {
	d := scratch('absent')
	defer {
		os.rmdir_all(d) or {}
	}
	wasm := beside(d, 'math_50', '')
	m := uwl.import_module(wasm)!
	assert m.call_i32('add', uwl.i32(3), uwl.i32(4))! == 7
	m.free()
	os.mkdir(os.join_path(d, 'math_50.wit'))!
	msg := load_error(wasm)
	assert msg.contains("cannot read .wit '"), msg
	assert msg.contains('math_50.wit'), msg
}

fn test_version_pin_without_a_version_global_fails() {
	if m := uwl.import_module(fixture('math_50.wasm') + '@9') {
		m.free()
		assert false, '@9 accepted on a module with no version global'
	}
}

fn test_a_missing_file_fails_to_load() {
	if m := uwl.import_module(fixture('no_such_module.wasm')) {
		m.free()
		assert false, 'a missing file loaded'
	}
}

fn test_an_unknown_export_fails() {
	m := uwl.import_module(fixture('math_50.wasm'))!
	defer {
		m.free()
	}
	if _ := m.call_i32('noSuchExport') {
		assert false, 'an unknown export returned a value'
	} else {
		assert err.msg() != ''
	}
}

// --- Host import callbacks (SPEC § 4 "Import wrapper", § 8 imports_50) --------

// imports_50_callbacks is SPEC § 8's `{ envMul: (a, b) => a * b, envAdd: (a, b) => a + b }`.
fn imports_50_callbacks() map[string]uwl.HostFn {
	mut cbs := map[string]uwl.HostFn{}
	cbs['envMul'] = fn (a []uwl.Arg) !uwl.Arg {
		return uwl.f64(a[0].as_f64()! * a[1].as_f64()!)
	}
	cbs['envAdd'] = fn (a []uwl.Arg) !uwl.Arg {
		return uwl.i32(a[0].as_i32()! + a[1].as_i32()!)
	}
	return cbs
}

// with_env_add is imports_50_callbacks() with `envAdd` replaced.
fn with_env_add(f uwl.HostFn) map[string]uwl.HostFn {
	mut cbs := imports_50_callbacks()
	cbs['envAdd'] = f
	return cbs
}

fn test_imports_50_host_import_callbacks() {
	mut cbs := imports_50_callbacks()
	cbs['notImported'] = fn (a []uwl.Arg) !uwl.Arg {
		return error('a callback the .wit does not import must be ignored')
	}
	m := uwl.import_module_with(fixture('imports_50.wasm'), cbs)!
	defer {
		m.free()
	}
	assert m.call_f64('scale', uwl.f64(3.0), uwl.f64(4.0))! == 12.0
	assert m.call_i32('combine', uwl.i32(10), uwl.i32(7))! == 17
}

// § 8: `imports_50` with only `envMul` names `envAdd` (and only it).
fn test_imports_50_with_only_env_mul_names_env_add() {
	mut cbs := imports_50_callbacks()
	cbs.delete('envAdd')
	if m := uwl.import_module_with(fixture('imports_50.wasm'), cbs) {
		m.free()
		assert false, 'imports_50 loaded without envAdd'
	} else {
		assert err.msg() == 'no host callback for WIT import: envAdd (WIT "env-add")', err.msg()
	}
}

// § 8: a callback value of the wrong kind for the import's `s32` result is never
// coerced; `combine(10, 7)` fails naming the callback, the import and its result
// type, and the value. (V's nothing() / f64 / s64 / bool / string stand for JS's
// undefined, 2.9, 2 ** 31 / 17n, true, "17"; `null` has no V value.)
fn test_a_callback_result_of_the_wrong_kind_is_refused() {
	cases := {
		'no value (void)':  uwl.nothing()
		'2.9 (f64)':        uwl.f64(2.9)
		'2147483648 (s64)': uwl.i64(2147483648)
		'17 (s64)':         uwl.i64(17)
		'true (bool)':      uwl.boolean(true)
		'"17" (string)':    uwl.text('17')
	}
	for shown, bad in cases {
		m := uwl.import_module_with(fixture('imports_50.wasm'), with_env_add(fn [bad] (a []uwl.Arg) !uwl.Arg {
			return bad
		}))!
		// The closure is reachable only through the Module now; a collection
		// must not free it (the C loader holds raw pointers V's GC cannot see).
		// A smoke check only: with the rooting removed it still passed
		// (2026-11-08) — a conservative GC rarely reuses the memory this soon.
		gc_collect()
		if _ := m.call_i32('combine', uwl.i32(10), uwl.i32(7)) {
			assert false, '${shown} accepted for an s32 result'
		} else {
			assert err.msg().contains('host callback envAdd (WIT import "env-add" -> s32) returned ${shown}'), err.msg()
		}
		m.free()
	}
}

// A callback's own error reaches the caller of the export that called the
// import, in place of the trap it caused; the next call starts clean.
fn test_a_callback_error_reaches_the_export_caller() {
	m := uwl.import_module_with(fixture('imports_50.wasm'), with_env_add(fn (a []uwl.Arg) !uwl.Arg {
		x := a[0].as_i32()!
		if x < 0 {
			return error('negative ${x}')
		}
		return uwl.i32(x + a[1].as_i32()!)
	}))!
	defer {
		m.free()
	}
	if _ := m.call_i32('combine', uwl.i32(-1), uwl.i32(7)) {
		assert false, 'a failing callback gave a result'
	} else {
		assert err.msg() == 'host callback envAdd failed: negative -1', err.msg()
	}
	assert m.call_i32('combine', uwl.i32(10), uwl.i32(7))! == 17
	// An argument read as the wrong kind is the callback's error too.
	w := uwl.import_module_with(fixture('imports_50.wasm'), with_env_add(fn (a []uwl.Arg) !uwl.Arg {
		return uwl.i32(int(a[0].as_f64()!))
	}))!
	defer {
		w.free()
	}
	if _ := w.call_i32('combine', uwl.i32(10), uwl.i32(7)) {
		assert false, 'an s32 argument was read as f64'
	} else {
		assert err.msg() == 'host callback envAdd failed: argument is s32, not f64', err.msg()
	}
}

// No stamped fixture has a void import, so this hand-assembled 59-byte module
// is written beside its `.wit` in a scratch dir:
//   (import "env" "ping" (func (param i32)))
//   (func (export "run") (param i32) (result i32) local.get 0 call 0 i32.const 1)
const ping_wasm = [u8(0x00), 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x0a, 0x02, 0x60,
	0x01, 0x7f, 0x00, 0x60, 0x01, 0x7f, 0x01, 0x7f, 0x02, 0x0c, 0x01, 0x03, 0x65, 0x6e, 0x76, 0x04,
	0x70, 0x69, 0x6e, 0x67, 0x00, 0x00, 0x03, 0x02, 0x01, 0x01, 0x07, 0x07, 0x01, 0x03, 0x72, 0x75,
	0x6e, 0x00, 0x01, 0x0a, 0x0a, 0x01, 0x08, 0x00, 0x20, 0x00, 0x10, 0x00, 0x41, 0x01, 0x0b]

struct Seen {
mut:
	calls []int
}

// A void import: a closure callback sees each argument and returns nothing().
// The C API gives a void import no way to trap, so a failing callback lets WASM
// finish — but the export call still fails with the callback's error.
fn test_a_void_import_callback_runs_and_its_error_still_fails_the_call() {
	assert ping_wasm.len == 59
	d := scratch('ping')
	defer {
		os.rmdir_all(d) or {}
	}
	os.write_file_array(os.join_path(d, 'ping.wasm'), ping_wasm)!
	os.write_file(os.join_path(d, 'ping.wit'),
		'world ping {\n  import ping: func(n: s32);\n  export run: func(n: s32) -> s32;\n}\n')!
	mut seen := &Seen{}
	mut cbs := map[string]uwl.HostFn{}
	cbs['ping'] = fn [mut seen] (a []uwl.Arg) !uwl.Arg {
		n := a[0].as_i32()!
		if n < 0 {
			return error('negative ${n}')
		}
		seen.calls << n
		return uwl.nothing()
	}
	m := uwl.import_module_with(os.join_path(d, 'ping.wasm'), cbs)!
	defer {
		m.free()
	}
	assert m.call_i32('run', uwl.i32(5))! == 1
	assert m.call_i32('run', uwl.i32(8))! == 1
	assert seen.calls == [5, 8]
	if _ := m.call_i32('run', uwl.i32(-3)) {
		assert false, 'a failing void-import callback went unreported'
	} else {
		assert err.msg() == 'host callback ping failed: negative -3', err.msg()
	}
	assert seen.calls == [5, 8]
}
