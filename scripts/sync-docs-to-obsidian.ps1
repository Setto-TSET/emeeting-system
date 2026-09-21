<#
.SYNOPSIS
    Sync tracked .md files from this repo into an Obsidian vault, preserving folder structure.

.DESCRIPTION
    Copies every git-tracked *.md file into <Vault>\meeting-project\, mirroring the repo layout.
    Removes .md files under that folder that no longer exist in the repo (true mirror).
    Only touches the meeting-project subfolder — nothing else in the vault.

.EXAMPLE
    pwsh ./scripts/sync-docs-to-obsidian.ps1
    pwsh ./scripts/sync-docs-to-obsidian.ps1 -DryRun
    pwsh ./scripts/sync-docs-to-obsidian.ps1 -Vault "D:\Obsidian\Other"
#>
param(
    # Obsidian vault root. Docs land in <Vault>\meeting-project\.
    [string]$Vault = "D:\Obsidian\Test",
    # Show what would change without writing.
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

# Repo root = parent of this script's folder (script lives in <repo>/scripts/).
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Dest = Join-Path $Vault "meeting-project"

Push-Location $RepoRoot
try {
    $tracked = git ls-files '*.md' | Where-Object { $_ -notmatch '(^|/)node_modules/' }
    if (-not $tracked) { throw "No tracked .md files found. Run from inside the repo." }

    $copied = 0
    foreach ($rel in $tracked) {
        $src = Join-Path $RepoRoot $rel
        $dst = Join-Path $Dest    $rel
        $dstDir = Split-Path -Parent $dst
        if ($DryRun) {
            Write-Host "COPY  $rel"
        } else {
            if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Force -Path $dstDir | Out-Null }
            Copy-Item -Path $src -Destination $dst -Force
        }
        $copied++
    }

    # Prune: .md under $Dest that are no longer tracked in the repo.
    $wanted = [System.Collections.Generic.HashSet[string]]::new()
    foreach ($rel in $tracked) { [void]$wanted.Add(($rel -replace '/', '\')) }

    $pruned = 0
    if (Test-Path $Dest) {
        Get-ChildItem -Path $Dest -Recurse -File -Filter *.md | ForEach-Object {
            $relDest = $_.FullName.Substring($Dest.Length).TrimStart('\')
            if (-not $wanted.Contains($relDest)) {
                if ($DryRun) { Write-Host "PRUNE $relDest" }
                else { Remove-Item -LiteralPath $_.FullName -Force }
                $pruned++
            }
        }
    }

    $verb = if ($DryRun) { "[dry-run] would sync" } else { "synced" }
    Write-Host ("{0} {1} file(s), pruned {2}, into {3}" -f $verb, $copied, $pruned, $Dest)
}
finally {
    Pop-Location
}
