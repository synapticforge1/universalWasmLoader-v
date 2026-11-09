// Idiomatic V binding for the Universal WASM Loader.
//
//   import uwl
//
//   m := uwl.import_module('tests/math_50.wasm')!
//   defer { m.free() }
//   sum := m.call_i32('add', uwl.i32(3), uwl.i32(4))!   // 7
//
// Values cross the boundary through a tiny C shim (uwl_shim.c); a companion
// `.wit` next to the `.wasm` is required for typed calls. A module that imports
// host functions is loaded with import_module_with(path, callbacks).
module uwl

#flag -Dstatic_assert=_Static_assert
#flag -I @VMODROOT/uwl
#flag -I @VMODROOT/vendor/wasmtime-v45.0.2-x86_64-mingw-c-api/include
#flag @VMODROOT/uwl/uwl_shim.c
#flag @VMODROOT/vendor/wasmtime-v45.0.2-x86_64-mingw-c-api/lib/libwasmtime.dll.a
#flag -lws2_32 -lbcrypt -luserenv -lntdll -lole32 -lShlwapi -ladvapi32 -lkernel32 -luuid
#include "uwl_shim.h"

// --- C shim FFI surface -----------------------------------------------------
// The declarations below mirror the primitive `uwlv_*` entry points in
// uwl_shim.h. They are the ONLY symbols that cross into C; every `pub` item
// further down is a safe V wrapper over them. (TS analogy: this block is the
// hand-written `declare`/.d.ts for the native addon.)

// Value `kind` discriminants — the tag carried by an `Arg` and by a call result.
// These MUST stay in lockstep with `uwl_kind_t` in universal_wasm_loader.h
// (changing the C enum without updating these silently mis-marshals values).
const k_void = 0 // no value (void export)
const k_i32 = 1 // 32-bit signed integer (WIT s32)
const k_i64 = 2 // 64-bit signed integer (WIT s64)
const k_f32 = 3 // 32-bit float (WIT f32)
const k_f64 = 4 // 64-bit float (WIT f64)
const k_bool = 5 // boolean
const k_str = 6 // UTF-8 string
const k_err = 7 // a host callback's failure; `s` is the message (loader-c 2.1.0 `UWL_ERR`)

// kind_name is the WIT name of a k_* discriminant, as the C loader spells it in
// its own messages (`uwl__kind_name`). (Internal.)
fn kind_name(k int) string {
	return match k {
		k_void { 'void' }
		k_i32 { 's32' }
		k_i64 { 's64' }
		k_f32 { 'f32' }
		k_f64 { 'f64' }
		k_bool { 'bool' }
		k_str { 'string' }
		k_err { 'error' }
		else { 'kind ${k}' }
	}
}

// C.uwl_module_t is the opaque module handle owned by the C loader.
@[typedef]
pub struct C.uwl_module_t {}

// C.uwlv_arg is the flat, by-value argument record handed to C.uwlv_call.
// Only the field selected by `kind` is read; the others are ignored.
@[typedef]
struct C.uwlv_arg {
mut:
	kind int // one of the k_* discriminants
	i    i64 // payload for i32 / i64 / bool
	d    f64 // payload for f32 / f64
	s    &char = unsafe { nil } // payload for str (NUL-terminated, borrowed)
}

// uwlv_import_with loads a module with `n` host callbacks: `names[k]` is the
// camelCase WIT import name, `ctxs[k]` the &HostSlot that host_dispatch gets
// back. On failure returns nil and sets `err` to a heap C string (free it with
// C.uwlv_free_str).
fn C.uwlv_import_with(path &char, names &&char, ctxs &voidptr, n usize, err &&char) &C.uwl_module_t

// uwlv_free releases a module handle and everything it owns.
fn C.uwlv_free(m &C.uwl_module_t)

// uwlv_free_str frees a heap C string handed back by the shim.
fn C.uwlv_free_str(s &char)

// uwlv_call invokes export `name` with `n` args, writing the result through the
// out-params. Returns 0 on success, non-zero on failure (with `err` set). The
// `out_*` param matching `out_kind` carries the value; `out_s` is a heap string
// the caller must free with C.uwlv_free_str.
fn C.uwlv_call(m &C.uwl_module_t, name &char, args &C.uwlv_arg, n usize, out_kind &int, out_i &i64, out_d &f64, out_s &&char, err &&char) int

// Arg is one native argument to an export call — a tagged union of the
// supported WIT scalar/string types.
//
// Do not construct it directly; use the i32()/i64()/f32()/f64()/boolean()/text()
// builders so the WIT type is explicit at the call site (TS analogy: these are
// the discriminated-union constructors, `kind` being the discriminant). Only the
// payload field selected by `kind` is meaningful.
pub struct Arg {
	kind int    // one of the k_* discriminants
	i    i64    // payload for i32/i64/bool
	d    f64    // payload for f32/f64
	s    string // payload for str
}

// i32 boxes a V `int` as a WIT `s32` argument.
// @param v  the integer value to pass
// @returns  an Arg the call_* functions marshal as `s32`
pub fn i32(v int) Arg {
	return Arg{
		kind: k_i32
		i:    v
	}
}

// i64 boxes a V `i64` as a WIT `s64` argument.
// @param v  the integer value to pass
// @returns  an Arg the call_* functions marshal as `s64`
pub fn i64(v i64) Arg {
	return Arg{
		kind: k_i64
		i:    v
	}
}

// f32 boxes a V `f32` as a WIT `f32` argument.
// @param v  the float value to pass
// @returns  an Arg the call_* functions marshal as `f32`
pub fn f32(v f32) Arg {
	return Arg{
		kind: k_f32
		d:    v
	}
}

// f64 boxes a V `f64` as a WIT `f64` argument.
// @param v  the float value to pass
// @returns  an Arg the call_* functions marshal as `f64`
pub fn f64(v f64) Arg {
	return Arg{
		kind: k_f64
		d:    v
	}
}

// boolean boxes a V `bool` as a WIT `bool` argument.
// @param v  the boolean value to pass
// @returns  an Arg the call_* functions marshal as `bool`
pub fn boolean(v bool) Arg {
	return Arg{
		kind: k_bool
		i:    if v { 1 } else { 0 }
	}
}

// text boxes a V `string` as a WIT `string` argument.
//
// The string is borrowed (not copied) for the duration of the call, so keep the
// source value alive until the call returns.
// @param v  the string value to pass
// @returns  an Arg the call_* functions marshal as `string`
pub fn text(v string) Arg {
	return Arg{
		kind: k_str
		s:    v
	}
}

// nothing is the value for a host callback whose WIT import has no result (the
// loader ignores what such a callback returns; any Arg would do).
// @returns  a void Arg
pub fn nothing() Arg {
	return Arg{
		kind: k_void
	}
}

// want refuses an Arg of another kind (no coercion, SPEC 4.0.0 § 4). (Internal.)
fn (a Arg) want(k int) ! {
	if a.kind != k {
		return error('argument is ${kind_name(a.kind)}, not ${kind_name(k)}')
	}
}

// as_i32 reads a host-callback argument of WIT type `s32`.
// @returns  the value
// @error    `argument is <kind>, not s32` for any other kind
pub fn (a Arg) as_i32() !int {
	a.want(k_i32)!
	return int(a.i)
}

// as_i64 reads a host-callback argument of WIT type `s64`.
// @returns  the value
// @error    `argument is <kind>, not s64` for any other kind
pub fn (a Arg) as_i64() !i64 {
	a.want(k_i64)!
	return a.i
}

// as_f32 reads a host-callback argument of WIT type `f32`.
// @returns  the value
// @error    `argument is <kind>, not f32` for any other kind
pub fn (a Arg) as_f32() !f32 {
	a.want(k_f32)!
	return f32(a.d)
}

// as_f64 reads a host-callback argument of WIT type `f64`.
// @returns  the value
// @error    `argument is <kind>, not f64` for any other kind
pub fn (a Arg) as_f64() !f64 {
	a.want(k_f64)!
	return a.d
}

// as_bool reads a host-callback argument of WIT type `bool`.
// @returns  the value
// @error    `argument is <kind>, not bool` for any other kind
pub fn (a Arg) as_bool() !bool {
	a.want(k_bool)!
	return a.i != 0
}

// as_str reads a host-callback argument of WIT type `string` (an owned copy).
// @returns  the value
// @error    `argument is <kind>, not string` for any other kind
pub fn (a Arg) as_str() !string {
	a.want(k_str)!
	return a.s
}

// HostFn is a host callback for one WIT import. It receives the import's
// arguments decoded by their WIT types (read them with as_i32() …) and returns
// the result built with the same builders as call arguments: `uwl.i32(…)` for
// an `s32` result, `uwl.f64(…)` for `f64`, …, and nothing() for an import with
// no result. The kind must BE the import's result kind — the loader never
// coerces; another kind fails the export call that reached the import, naming
// the callback, the import, the type and the value. An error the callback
// returns stops the WASM at that import (void imports too) and fails the export
// call with `host callback <name> failed: <msg>`.
pub type HostFn = fn (args []Arg) !Arg

// HostState is what a Module's callbacks share: the slots (kept here so V's
// GC sees them — the C loader holds only raw pointers) and the first error a
// callback returned during the current call. (Internal.)
@[heap]
struct HostState {
mut:
	slots  []&HostSlot
	failed bool
	err    string
}

// HostSlot is one registered callback; its address is the C `userdata`. (Internal.)
@[heap]
struct HostSlot {
	name  string
	f     HostFn = unsafe { nil }
	state &HostState
}

// host_dispatch is called from C (the shim's import trampoline) for every
// import call: it decodes the arguments, runs the V callback and encodes its
// value. A callback error goes back as kind k_err carrying the message; the
// shim turns it into the loader's `uwl_err`, which traps at the import. The
// message is also recorded, so invoke() reports it in 2.0.0's wording instead
// of wasmtime's multi-line trap text. (Internal.)
@[export: 'uwlv_host_dispatch']
fn host_dispatch(ctx voidptr, args &C.uwlv_arg, n usize, mut out C.uwlv_arg) {
	slot := unsafe { &HostSlot(ctx) }
	mut vargs := []Arg{cap: int(n)}
	for idx in 0 .. int(n) {
		a := unsafe { args[idx] }
		vargs << Arg{
			kind: a.kind
			i:    a.i
			d:    a.d
			s:    if a.kind == k_str && a.s != unsafe { nil } {
				unsafe { cstring_to_vstring(a.s) }
			} else {
				''
			}
		}
	}
	r := slot.f(vargs) or {
		// The message is borrowed until the shim copies it (uwl_err) in the
		// same C frame, which keeps the pointer visible to V's GC.
		msg := err.msg()
		mut st := slot.state
		if !st.failed {
			st.failed = true
			st.err = 'host callback ${slot.name} failed: ${msg}'
		}
		out.kind = k_err
		out.s = &char(msg.str)
		return
	}
	out.kind = r.kind
	out.i = r.i
	out.d = r.d
	out.s = if r.kind == k_str { &char(r.s.str) } else { &char(unsafe { nil }) }
}

// Module is a loaded, ABI-translated WASM module. Obtain one from
// import_module() or import_module_with() and release it with free(); its
// fields (the opaque C loader handle and the callbacks' state) are not meant to
// be touched directly.
pub struct Module {
	handle &C.uwl_module_t
	state  &HostState
}

// import_module loads a `.wasm` and ABI-translates it so its exports can be
// called with native V values. It passes no host callbacks: see
// import_module_with() for a module whose `.wit` declares imports.
//
// The companion `.wit` (same base name, alongside the `.wasm`) is auto-detected
// and supplies the per-export argument/result types (SPEC 4.0.0 § 2): only an
// ABSENT `.wit` gives raw exports; a `.wit` that cannot be read or does not
// parse fails the load, naming it and the fault. A `@N` suffix on `path` pins
// the module to version N. Every WIT import needs a host callback (SPEC § 4),
// so here a module whose `.wit` declares an import fails to load, naming each.
//
// @param path  filesystem path to the `.wasm` (optionally with a `@N` version suffix)
// @returns     a ready-to-call Module — release it with `m.free()`
// @error       the underlying loader message if the module fails to load/translate
pub fn import_module(path string) !Module {
	return import_module_with(path, map[string]HostFn{})
}

// import_module_with is import_module() with host callbacks for the module's
// WIT imports, keyed by the import's camelCase name (WIT `env-mul` → `envMul`):
//
//   m := uwl.import_module_with('tests/imports_50.wasm', {
//       'envMul': fn (a []uwl.Arg) !uwl.Arg { return uwl.f64(a[0].as_f64()! * a[1].as_f64()!) }
//       'envAdd': fn (a []uwl.Arg) !uwl.Arg { return uwl.i32(a[0].as_i32()! + a[1].as_i32()!) }
//   })!
//
// Every WIT import needs one; a missing one fails the load naming all of them,
// and so does an import with a `string` result (not supported). Callbacks for
// names the `.wit` does not import are ignored. A callback may be a closure;
// the Module keeps it alive until free().
//
// @param path       as for import_module()
// @param callbacks  camelCase WIT import name → HostFn
// @returns          a ready-to-call Module — release it with `m.free()`
// @error            the loader message if the module fails to load/translate
pub fn import_module_with(path string, callbacks map[string]HostFn) !Module {
	mut st := &HostState{}
	mut names := []&char{cap: callbacks.len}
	mut ctxs := []voidptr{cap: callbacks.len}
	for name, f in callbacks {
		slot := &HostSlot{
			name:  name
			f:     f
			state: st
		}
		st.slots << slot
		names << &char(slot.name.str)
		ctxs << voidptr(slot)
	}
	err := &char(unsafe { nil })
	// With no callbacks the shim reads neither array (n = 0).
	h := C.uwlv_import_with(&char(path.str), names.data, ctxs.data, usize(names.len), &err)
	if h == unsafe { nil } {
		return error(take_err(err, 'import failed'))
	}
	return Module{
		handle: h
		state:  st
	}
}

// free releases the module and every resource it owns.
//
// Call exactly once per module (typically via `defer { m.free() }`); using the
// Module after free() is undefined behavior.
pub fn (m &Module) free() {
	C.uwlv_free(m.handle)
}

// take_err converts a heap C error string into an owned V string and frees the
// C copy, falling back to `fallback` when `err` is nil. (Internal.)
// @param err       the C error string from the shim, or nil
// @param fallback  message to use when `err` is nil
// @returns         an owned V string; the C string (if any) is freed
fn take_err(err &char, fallback string) string {
	if err == unsafe { nil } {
		return fallback
	}
	msg := unsafe { cstring_to_vstring(err) }
	C.uwlv_free_str(err)
	return msg
}

// invoke marshals `args` into the flat C record, calls the export, and returns
// the raw result tuple. Shared core for the typed call_* wrappers. (Internal.)
//
// String results are copied into an owned V string and the C heap copy is freed
// here, so callers never deal with C memory.
//
// @param name  the exported function name
// @param args  the native arguments (already boxed as Arg)
// @returns     (kind, int_val, float_val, str_val) — read the field selected by `kind`
// @error       the loader message if the call fails (bad name, arity/type mismatch, trap)
fn (m &Module) invoke(name string, args []Arg) !(int, i64, f64, string) {
	mut cargs := []C.uwlv_arg{len: args.len}
	for idx, a in args {
		cargs[idx] = C.uwlv_arg{
			kind: a.kind
			i:    a.i
			d:    a.d
			s:    if a.kind == k_str { &char(a.s.str) } else { &char(unsafe { nil }) }
		}
	}

	mut out_kind := 0
	mut out_i := i64(0)
	mut out_d := 0.0
	out_s := &char(unsafe { nil })
	err := &char(unsafe { nil })

	data := unsafe {
		if args.len > 0 { &C.uwlv_arg(cargs.data) } else { &C.uwlv_arg(nil) }
	}
	mut st := m.state
	st.failed = false
	st.err = ''
	rc := C.uwlv_call(m.handle, &char(name.str), data, usize(args.len), &out_kind, &out_i, &out_d,
		&out_s, &err)
	// A callback's own error outranks the trap text it caused (wasmtime's
	// "error while executing at wasm backtrace: … Caused by: …").
	if st.failed {
		if rc != 0 {
			take_err(err, '')
		} else if out_kind == k_str && out_s != unsafe { nil } {
			C.uwlv_free_str(out_s)
		}
		return error(st.err)
	}
	if rc != 0 {
		return error(take_err(err, 'call failed'))
	}

	mut s := ''
	if out_kind == k_str && out_s != unsafe { nil } {
		s = unsafe { cstring_to_vstring(out_s) }
		C.uwlv_free_str(out_s)
	}
	return out_kind, out_i, out_d, s
}

// expect is invoke() for a kind-specific accessor: a result of any kind other
// than `want` is an error, never a zero value (SPEC 4.0.0 § 4). The message is
// the C loader's own (`uwl__call_expect`). (Internal.)
// @param name  the exported function name
// @param args  the native arguments (already boxed as Arg)
// @param want  the k_* kind the accessor returns
// @returns     (int_val, float_val, str_val) — read the field `want` selects
// @error       the loader message, or `export '<name>' returns <kind>, not <want>`
fn (m &Module) expect(name string, args []Arg, want int) !(i64, f64, string) {
	kind, i, d, s := m.invoke(name, args)!
	if kind != want {
		return error("export '${name}' returns ${kind_name(kind)}, not ${kind_name(want)}")
	}
	return i, d, s
}

// call_i32 invokes export `name` and returns its `s32` result.
// @param name  the exported function name (from the module's `.wit`)
// @param args  call arguments, each built with i32()/i64()/f32()/f64()/boolean()/text()
// @returns     the 32-bit signed integer result
// @error       the loader message if the export is missing, the arity/types mismatch, or it
//              traps; an error naming both kinds if the export does not return `s32`
pub fn (m &Module) call_i32(name string, args ...Arg) !int {
	i, _, _ := m.expect(name, args, k_i32)!
	return int(i)
}

// call_i64 invokes export `name` and returns its `s64` result.
// @param name  the exported function name (from the module's `.wit`)
// @param args  call arguments, each built with i32()/i64()/f32()/f64()/boolean()/text()
// @returns     the 64-bit signed integer result
// @error       the loader message if the export is missing, the arity/types mismatch, or it
//              traps; an error naming both kinds if the export does not return `s64`
pub fn (m &Module) call_i64(name string, args ...Arg) !i64 {
	i, _, _ := m.expect(name, args, k_i64)!
	return i
}

// call_f32 invokes export `name` and returns its `f32` result.
// @param name  the exported function name (from the module's `.wit`)
// @param args  call arguments, each built with i32()/i64()/f32()/f64()/boolean()/text()
// @returns     the 32-bit float result
// @error       the loader message if the export is missing, the arity/types mismatch, or it
//              traps; an error naming both kinds if the export does not return `f32`
pub fn (m &Module) call_f32(name string, args ...Arg) !f32 {
	_, d, _ := m.expect(name, args, k_f32)!
	return f32(d)
}

// call_f64 invokes export `name` and returns its `f64` result.
//
// Since 2.0.0 an `f32` export is refused here (it used to be widened); use call_f32().
// @param name  the exported function name (from the module's `.wit`)
// @param args  call arguments, each built with i32()/i64()/f32()/f64()/boolean()/text()
// @returns     the 64-bit float result
// @error       the loader message if the export is missing, the arity/types mismatch, or it
//              traps; an error naming both kinds if the export does not return `f64`
pub fn (m &Module) call_f64(name string, args ...Arg) !f64 {
	_, d, _ := m.expect(name, args, k_f64)!
	return d
}

// call_bool invokes export `name` and returns its `bool` result.
// @param name  the exported function name (from the module's `.wit`)
// @param args  call arguments, each built with i32()/i64()/f32()/f64()/boolean()/text()
// @returns     the boolean result
// @error       the loader message if the export is missing, the arity/types mismatch, or it
//              traps; an error naming both kinds if the export does not return `bool`
pub fn (m &Module) call_bool(name string, args ...Arg) !bool {
	i, _, _ := m.expect(name, args, k_bool)!
	return i != 0
}

// call_void invokes export `name` for its effect and discards any result (as the
// C loader's `uwl_call_void` does). Use it for a void export, which every typed
// accessor refuses.
// @param name  the exported function name (from the module's `.wit`)
// @param args  call arguments, each built with i32()/i64()/f32()/f64()/boolean()/text()
// @error       the loader message if the export is missing, the arity/types mismatch, or it traps
pub fn (m &Module) call_void(name string, args ...Arg) ! {
	m.invoke(name, args)!
}

// call_str invokes export `name` and returns its `string` result.
//
// The result is copied into an owned V string (managed by V's GC); no manual
// freeing is required on the V side.
// @param name  the exported function name (from the module's `.wit`)
// @param args  call arguments, each built with i32()/i64()/f32()/f64()/boolean()/text()
// @returns     the string result (owned by the caller)
// @error       the loader message if the export is missing, the arity/types mismatch, or it
//              traps; an error naming both kinds if the export does not return `string`
pub fn (m &Module) call_str(name string, args ...Arg) !string {
	_, _, s := m.expect(name, args, k_str)!
	return s
}
