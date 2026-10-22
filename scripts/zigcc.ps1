# Use `zig cc` as V's C compiler on Windows (no Git Bash required).
#
# V passes its flags in a response file (cc @file.rsp) and hardcodes
# `-Wl,-stack=...`, which zig's bundled lld rejects. We rewrite the response
# file to drop that one flag (zig's default stack size is fine) and force the
# MinGW-GNU target so the wasmtime GNU import library links.
#
# The arguments are NOT taken from $args: `powershell -File` binds an argument
# like `-I"C:\dir"` as a named parameter `-IC:` and splits it into `-IC` and
# `\dir` (the colon is lost), which V 0.5.2 hits when it builds libgc. Instead
# the raw command-line tail after the script path is forwarded to zig verbatim,
# so zig re-parses it with the same Windows quoting rules V wrote it with.
$ErrorActionPreference = 'Stop'

if ([Environment]::CommandLine -notmatch '(?i)-File\s+(?:"[^"]*"|\S+)\s*(.*)$') {
    Write-Error 'zigcc.ps1: could not locate the compiler arguments on the command line'
    exit 2
}
$tail = $Matches[1] -replace '-Wl,-stack=\d+', ''

$tail = [regex]::Replace($tail, '@("?)([^"\s]+\.rsp)\1', {
        param($m)
        $rsp = $m.Groups[2].Value
        $filtered = $rsp + '.zig.rsp'
        (Get-Content -Raw -LiteralPath $rsp) -replace '-Wl,-stack=\d+', '' |
            Set-Content -NoNewline -Encoding Ascii -LiteralPath $filtered
        '@' + $m.Groups[1].Value + $filtered + $m.Groups[1].Value
    })

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = (Get-Command zig -CommandType Application).Source
$psi.Arguments = 'cc -target x86_64-windows-gnu ' + $tail
$psi.UseShellExecute = $false
$p = [System.Diagnostics.Process]::Start($psi)
$p.WaitForExit()
exit $p.ExitCode
