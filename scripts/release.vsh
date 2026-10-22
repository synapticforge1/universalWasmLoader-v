#!/usr/bin/env -S v

// Cut a release of universalWasmLoader-v consistently.
//
// The single source of truth for the version is the `version:` field in v.mod.
// This script reads it, tags the current commit `v<version>`, pushes the branch
// and tag to `origin`, and (unless --no-release) creates the matching GitHub
// Release. VPM (the V package manager) resolves the package from the git repo
// itself, so the pushed tag/commit is the part that actually matters; the GitHub
// Release is human-readable polish. Publishing to VPM is a separate, deliberate
// step; see scripts/publish.vsh.
//
// Idempotent: if the tag already exists it is reused (must point at HEAD); an
// existing GitHub Release is left untouched.
import os

const help = 'Cut a release of universalWasmLoader-v (version from v.mod).

Usage: v run scripts/release.vsh [options]
  --notes <text>   Release notes body (default: a generic line).
  --no-release     Push the tag only; skip creating a GitHub Release.
  --no-build       Skip the `v run examples/adder.v` verification.
  --remote <name>  Git remote to push to (default: origin).
  --dry-run        Print what would happen; make no tags/pushes/releases.
  -h, --help       Show this help.

Idempotent: if the tag already exists it is reused (must point at HEAD); an
existing GitHub Release is left untouched.'

@[noreturn]
fn die(code int, msg string) {
	eprintln('error: ${msg}')
	exit(code)
}

// capture runs a command without a shell and returns its exit code and trimmed stdout.
fn capture(args []string) (int, string) {
	exe := os.find_abs_path_of_executable(args[0]) or { return 127, '' }
	mut p := os.new_process(exe)
	p.set_args(args[1..])
	p.set_redirect_stdio()
	p.run()
	out := p.stdout_slurp()
	p.wait()
	code := p.code
	p.close()
	return code, out.trim_space()
}

// run echoes a command, then (unless dry_run) runs it with inherited stdio and exits on failure.
fn run(dry_run bool, args []string) {
	println('+ ${args.join(' ')}')
	flush_stdout() // keep our lines ahead of the child's output when piped
	if dry_run {
		return
	}
	exe := os.find_abs_path_of_executable(args[0]) or { die(127, '${args[0]} not found on PATH') }
	mut p := os.new_process(exe)
	p.set_args(args[1..])
	p.run()
	p.wait()
	code := p.code
	p.close()
	if code != 0 {
		exit(code)
	}
}

// mod_field returns the first single-quoted value after `<key>:` in v.mod text.
fn mod_field(text string, key string) string {
	k := text.index('${key}:') or { return '' }
	q1 := text.index_after("'", k) or { return '' }
	q2 := text.index_after("'", q1 + 1) or { return '' }
	return text[q1 + 1..q2]
}

here := os.dir(os.dir(os.real_path(@FILE)))
os.chdir(here)!

mut notes := ''
mut make_release := true
mut do_build := true
mut remote := 'origin'
mut dry_run := false
argv := os.args[1..]
mut i := 0
for i < argv.len {
	a := argv[i]
	match a {
		'--notes', '--remote' {
			if i + 1 >= argv.len {
				die(2, 'missing value for ${a}')
			}
			if a == '--notes' {
				notes = argv[i + 1]
			} else {
				remote = argv[i + 1]
			}
			i++
		}
		'--no-release' {
			make_release = false
		}
		'--no-build' {
			do_build = false
		}
		'--dry-run' {
			dry_run = true
		}
		'-h', '--help' {
			println(help)
			exit(0)
		}
		else {
			die(2, 'unknown argument: ${a}')
		}
	}

	i++
}

// --- Derive version from v.mod (source of truth) ----------------------------
version := mod_field(os.read_file('v.mod') or { '' }, 'version')
if version == '' {
	die(1, 'could not read version from v.mod')
}
tag := 'v${version}'
println('Releasing ${tag} (from v.mod)')

// --- Preflight checks -------------------------------------------------------
_, porcelain := capture(['git', 'status', '--porcelain'])
if porcelain != '' {
	eprintln('error: working tree is dirty — commit or stash before releasing.')
	_, short := capture(['git', 'status', '--short'])
	eprintln(short)
	exit(1)
}

_, branch := capture(['git', 'rev-parse', '--abbrev-ref', 'HEAD'])
println('On branch: ${branch}')

// If the tag already exists, it must point at the current commit.
mut tag_exists := false
tag_code, _ := capture(['git', 'rev-parse', '-q', '--verify', 'refs/tags/${tag}'])
if tag_code == 0 {
	_, tag_commit := capture(['git', 'rev-parse', '${tag}^{commit}'])
	_, head := capture(['git', 'rev-parse', 'HEAD'])
	if tag_commit != head {
		eprintln('error: tag ${tag} exists but does not point at HEAD.')
		eprintln('       Bump version in v.mod or move the tag deliberately.')
		exit(1)
	}
	println('tag ${tag} already exists at HEAD — reusing.')
	tag_exists = true
}

// --- Verify it builds -------------------------------------------------------
// V's default tcc cannot link wasmtime. If VFLAGS already selects a C compiler
// (-cc ...), trust it and run plain `v`. Otherwise use the zigcc tool (built
// from scripts/zigcc.v on first use) when `zig` is on PATH, else fall back to
// plain `v` (may fail).
if do_build {
	println('Verifying build (v run examples/adder.v)…')
	if os.getenv('VFLAGS').contains('-cc') {
		run(dry_run, ['v', 'run', 'examples/adder.v'])
	} else if _ := os.find_abs_path_of_executable('zig') {
		zigcc := os.join_path(here, 'scripts', $if windows { 'zigcc.exe' } $else { 'zigcc' })
		if !os.exists(zigcc) {
			run(dry_run, ['v', '-o', zigcc, os.join_path(here, 'scripts', 'zigcc.v')])
		}
		run(dry_run, ['v', '-cc', zigcc, 'run', 'examples/adder.v'])
	} else {
		eprintln('warning: no -cc in VFLAGS and zig not found; trying default compiler.')
		run(dry_run, ['v', 'run', 'examples/adder.v'])
	}
}

// --- Tag, push, release -----------------------------------------------------
if !tag_exists {
	run(dry_run, ['git', 'tag', '-a', tag, '-m', 'universalWasmLoader-v ${tag}'])
}

run(dry_run, ['git', 'push', remote, branch])
run(dry_run, ['git', 'push', remote, tag])

if make_release {
	if _ := os.find_abs_path_of_executable('gh') {
		view_code, _ := capture(['gh', 'release', 'view', tag])
		if view_code == 0 {
			println('GitHub Release ${tag} already exists — leaving it untouched.')
		} else {
			body := if notes != '' {
				notes
			} else {
				'Release ${tag} of universalWasmLoader-v — idiomatic V binding for the Universal WASM Loader.'
			}
			run(dry_run, ['gh', 'release', 'create', tag, '--title', tag, '--notes', body])
		}
	} else {
		eprintln('warning: gh CLI not found — skipping GitHub Release (tag is pushed).')
	}
}

println('Done: ${tag}')
