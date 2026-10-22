#!/usr/bin/env -S v

// Publish this package to VPM (the V package manager): a SEPARATE, deliberate
// step, intentionally kept out of release.vsh.
//
// VPM has NO upload/CLI publish command. Like Go modules, VPM resolves a package
// from the git repository itself: a module is registered ONCE by submitting its
// git repo URL at https://vpm.vlang.io/new (no auth token, no per-version
// upload). After that, `v install synapticforge1.uwl` clones the repo
// and `v update` pulls new commits. There is nothing to upload per release; the
// pushed tag/commit IS the published artifact once the repo is registered.
//
// So this script is a clearly-logged NO-OP: it confirms the released tag exists
// (so you "publish" exactly what was released), then prints what to do. It exists
// to keep the bump -> release -> publish ritual and shape uniform with the sibling
// ports (crates.io/npm/PyPI, which DO need a real upload).
//
// Prereq order:  bump-version.vsh -> release.vsh -> publish.vsh
//
// Idempotent by nature: re-running changes nothing (no upload happens).
import os

const help = "Publish to VPM: a logged no-op that checks the release tag (version from v.mod).

Usage: v run scripts/publish.vsh [options]
  --yes             Accepted for shape parity; there is no irreversible upload
                    to confirm (VPM publish is a no-op), so it changes nothing.
  --dry-run         Print what would happen; change nothing.
  --allow-dirty     Skip the clean-working-tree check.
  --skip-tag-check  Don't require the v<version> tag to exist locally + on remote.
  --remote <name>   Git remote to check the tag against (default: origin).
  -h, --help        Show this help."

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

// guard is fatal in a real run; downgraded to a warning under --dry-run so the flow is inspectable.
fn guard(dry_run bool, msg string) {
	if dry_run {
		eprintln('warning (ignored under --dry-run): ${msg}')
		return
	}
	die(1, msg)
}

// mod_field returns the first single-quoted value after `<key>:` in v.mod text.
fn mod_field(text string, key string) string {
	k := text.index('${key}:') or { return '' }
	q1 := text.index_after("'", k) or { return '' }
	q2 := text.index_after("'", q1 + 1) or { return '' }
	return text[q1 + 1..q2]
}

os.chdir(os.dir(os.dir(os.real_path(@FILE))))!

mut dry_run := false
mut allow_dirty := false
mut skip_tag_check := false
mut remote := 'origin'
argv := os.args[1..]
mut i := 0
for i < argv.len {
	a := argv[i]
	match a {
		'--yes' {}
		'--dry-run' {
			dry_run = true
		}
		'--allow-dirty' {
			allow_dirty = true
		}
		'--skip-tag-check' {
			skip_tag_check = true
		}
		'--remote' {
			if i + 1 >= argv.len {
				die(2, 'missing value for --remote')
			}
			remote = argv[i + 1]
			i++
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

// --- Version / tag (source of truth: v.mod) ---------------------------------
mod_text := os.read_file('v.mod') or { '' }
version := mod_field(mod_text, 'version')
if version == '' {
	die(1, 'could not read version from v.mod')
}
tag := 'v${version}'
module_name := if mod_field(mod_text, 'name') != '' { mod_field(mod_text, 'name') } else { 'uwl' }
println('Publishing ${tag} to VPM (module: ${module_name})')

// --- Preflight: clean tree --------------------------------------------------
if !allow_dirty {
	_, porcelain := capture(['git', 'status', '--porcelain'])
	if porcelain != '' {
		guard(dry_run, 'working tree is dirty — commit/stash, or pass --allow-dirty.')
	}
}

// --- Preflight: the release tag exists locally and on the remote ------------
if !skip_tag_check {
	tag_code, _ := capture(['git', 'rev-parse', '-q', '--verify', 'refs/tags/${tag}'])
	if tag_code != 0 {
		guard(dry_run,
			'tag ${tag} not found locally — run scripts/release.vsh first (or --skip-tag-check).')
	}
	_, remote_tags := capture(['git', 'ls-remote', '--tags', remote, tag])
	if !remote_tags.contains('refs/tags/${tag}') {
		guard(dry_run,
			'tag ${tag} not on ${remote} — push it (scripts/release.vsh) before publishing (or --skip-tag-check).')
	}
}

// --- Publish: a no-op for VPM -----------------------------------------------
// Nothing to upload. --yes/--dry-run are accepted for shape parity with the
// other ports; there is no irreversible action here to confirm or to simulate.
url_code, url := capture(['git', 'remote', 'get-url', remote])
origin_url := if url_code == 0 && url != '' { url } else { '<your repo URL>' }

println('VPM has no upload/CLI publish — this step is a no-op (by design).

How VPM publishing actually works (like Go modules — it resolves off the repo):
  1. ONE-TIME registration: submit the repo URL at https://vpm.vlang.io/new
       repo: ${origin_url}
     Once registered the module is installable as:
       v install <repo-owner>.${module_name}
       (VPM prepends the repo\'s GitHub owner, e.g. synapticforge1.${module_name})
  2. UPDATES: there is no per-version upload. Consumers get new code by
       v update <module>
     which pulls the repo. So pushing ${tag} (done by scripts/release.vsh) is all
     that "publishing this version" requires once the repo is registered.

Nothing was changed. The pushed ${tag} tag/commit is the published artifact.')

println('Done: VPM publish is a no-op; ${tag} is already the released state.')
