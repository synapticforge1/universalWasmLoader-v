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

// Host import callbacks are not exposed from V (overview § Known gaps). The C
// loader binds every WIT import anyway, and one with no callback returns zero,
// as the JS reference does (abi.js `if (!cb) return fn.result ? 0 : undefined`),
// so `scale` (env.mul) and `combine` (env.add) both read 0 here.
fn test_imports_50_without_host_callbacks_reads_zero() {
	m := uwl.import_module(fixture('imports_50.wasm'))!
	defer {
		m.free()
	}
	assert m.call_f64('scale', uwl.f64(3.0), uwl.f64(4.0))! == 0.0
	assert m.call_i32('combine', uwl.i32(10), uwl.i32(7))! == 0
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
