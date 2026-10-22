#!/usr/bin/env -S v

// Bump the project version in v.mod (the single source of truth).
//
// Updates the `version:` field to the next semver, commits the one-line change,
// and stops there; tagging/pushing/releasing is scripts/release.vsh's job.
// Typical flow:
//
//     v run scripts/bump-version.vsh minor   # 1.0.0 -> 1.1.0, commits the bump
//     v run scripts/release.vsh              # tags v1.1.0, pushes, GitHub Release
//
// Refuses to run on a dirty tree (so the bump lands as an isolated commit) and
// rejects a target that isn't strictly greater than the current version or whose
// tag already exists.
import os

const help = "Bump the project version in v.mod (the single source of truth).

Usage: v run scripts/bump-version.vsh <major|minor|patch|X.Y.Z> [options]
  major|minor|patch   Increment that semver component (resets lower ones).
  X.Y.Z               Set an explicit version (must be valid semver).
  --no-commit         Edit v.mod only; don't commit.
  --dry-run           Print the new version + planned actions; change nothing.
  -h, --help          Show this help.

Refuses to run on a dirty tree (so the bump lands as an isolated commit) and
rejects a target that isn't strictly greater than the current version or whose
tag already exists."

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

// version_span returns the start and end of the quoted `version:` value in v.mod text.
fn version_span(text string) ?(int, int) {
	k := text.index('version:') or { return none }
	q1 := text.index_after("'", k) or { return none }
	q2 := text.index_after("'", q1 + 1) or { return none }
	return q1 + 1, q2
}

fn parse_semver(s string) ?[]int {
	parts := s.split('.')
	if parts.len != 3 {
		return none
	}
	mut out := []int{}
	for p in parts {
		if p == '' || !p.bytes().all(it.is_digit()) {
			return none
		}
		out << p.int()
	}
	return out
}

fn greater(a []int, b []int) bool {
	for i in 0 .. 3 {
		if a[i] != b[i] {
			return a[i] > b[i]
		}
	}
	return false
}

os.chdir(os.dir(os.dir(os.real_path(@FILE))))!
mod_file := 'v.mod'

mut do_commit := true
mut dry_run := false
mut spec := ''
for a in os.args[1..] {
	match a {
		'--no-commit' {
			do_commit = false
		}
		'--dry-run' {
			dry_run = true
		}
		'-h', '--help' {
			println(help)
			exit(0)
		}
		'major', 'minor', 'patch' {
			spec = a
		}
		else {
			if a.len > 0 && a[0].is_digit() && a.count('.') >= 2 {
				spec = a
			} else {
				die(2, 'unknown argument: ${a}')
			}
		}
	}
}
if spec == '' {
	die(2, 'missing bump spec (major|minor|patch|X.Y.Z). See --help.')
}

// --- Current version --------------------------------------------------------
text := os.read_file(mod_file) or { die(1, 'cannot read ${mod_file}: ${err}') }
s, e := version_span(text) or {
	die(1, "current version in ${mod_file} is not plain semver: '<empty>'")
}
cur := text[s..e]
cv := parse_semver(cur) or {
	die(1, "current version in ${mod_file} is not plain semver: '${cur}'")
}

// --- Compute target ---------------------------------------------------------
new := match spec {
	'major' { '${cv[0] + 1}.0.0' }
	'minor' { '${cv[0]}.${cv[1] + 1}.0' }
	'patch' { '${cv[0]}.${cv[1]}.${cv[2] + 1}' }
	else { spec }
}

nv := parse_semver(new) or { die(2, "'${spec}' is not valid semver (X.Y.Z).") }

// --- Validate (strictly greater, tag free) ----------------------------------
if !greater(nv, cv) {
	die(1, 'target ${new} is not greater than current ${cur}.')
}
tag_code, _ := capture(['git', 'rev-parse', '-q', '--verify', 'refs/tags/v${new}'])
if tag_code == 0 {
	die(1, 'tag v${new} already exists.')
}

println('Bumping version: ${cur} -> ${new}')

// --- Preflight: clean tree --------------------------------------------------
if do_commit && !dry_run {
	_, porcelain := capture(['git', 'status', '--porcelain'])
	if porcelain != '' {
		eprintln('error: working tree is dirty — commit or stash so the bump is isolated.')
		_, short := capture(['git', 'status', '--short'])
		eprintln(short)
		exit(1)
	}
}

// --- Apply ------------------------------------------------------------------
if !dry_run {
	// Replace only the version value, preserving formatting.
	os.write_file(mod_file, text[..s] + new + text[e..]) or {
		die(1, 'cannot write ${mod_file}: ${err}')
	}
}
println("+ set version: '${new}' in ${mod_file}")

if do_commit {
	run(dry_run, ['git', 'add', mod_file])
	run(dry_run, ['git', 'commit', '-m', 'Bump version: v${cur} -> v${new}'])
}

println('Done: ${new}')
if do_commit {
	println('Next: v run scripts/release.vsh   # tags v${new}, pushes, creates the GitHub Release')
}
