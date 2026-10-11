# Cargo's Windows-only test runner activates Common Controls v6 after linking.
# Library unit-test harnesses do not receive tauri-build's application manifest.
# Post-link embedding avoids duplicate manifest resources in production builds.
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string] $TestExecutable,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $TestArguments
)

$ErrorActionPreference = 'Stop'
$executable = (Resolve-Path -LiteralPath $TestExecutable).Path
$manifest = Join-Path $PSScriptRoot 'windows-test.manifest'

# Use the Windows SDK's x64 manifest tool, not an unrelated tool on PATH.
$sdkBin = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
$manifestTool = Get-ChildItem -LiteralPath $sdkBin -Directory |
    Where-Object { $_.Name -match '^\d+\.\d+\.\d+\.\d+$' } |
    Sort-Object { [version] $_.Name } -Descending |
    ForEach-Object { Join-Path $_.FullName 'x64\mt.exe' } |
    Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
    Select-Object -First 1
if (-not $manifestTool) {
    throw "Windows SDK mt.exe not found under $sdkBin; cannot prepare the test manifest."
}

Write-Host "Embedding Common Controls v6 into $executable using $manifestTool"
& $manifestTool -nologo -manifest $manifest "-outputresource:$executable;#1"
if ($LASTEXITCODE -ne 0) {
    throw "Test manifest embedding failed with exit code $LASTEXITCODE."
}

# JDK/toolchain directories can carry stale API-set DLLs that shadow OS APIs.
# Keep Windows system directories; prune only non-system overlays for this child.
$windowsRoot = [IO.Path]::GetFullPath($env:SystemRoot).TrimEnd('\') + '\'
$safePath = foreach ($directory in ($env:Path -split ';')) {
    if (-not $directory) { continue }
    $expanded = [Environment]::ExpandEnvironmentVariables($directory.Trim('"'))
    $systemDirectory = [IO.Path]::GetFullPath($expanded).StartsWith(
        $windowsRoot, [StringComparison]::OrdinalIgnoreCase
    )
    if (-not $systemDirectory -and (Test-Path -LiteralPath $expanded -PathType Container)) {
        $overlay = Get-ChildItem -LiteralPath $expanded -Filter 'api-ms-win-*.dll' -File |
            Select-Object -First 1
        if ($overlay) {
            Write-Host "Excluding DLL overlay directory from test PATH: $expanded"
            continue
        }
    }
    $directory
}
$env:Path = $safePath -join ';'

& $executable @TestArguments
exit $LASTEXITCODE
