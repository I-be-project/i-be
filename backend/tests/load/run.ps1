param(
    [ValidateSet('smoke', 'steady', 'burst10', 'burst5', 'sync100', 'sync300', 'sync500', 'all', 'mixed')]
    [string]$Profile = 'smoke',
    [ValidateSet('own', 'shared', 'visit', 'all')]
    [string]$Journey = 'all',
    [string]$BaseUrl,
    [string]$EnvFile,
    [string]$CleanupRun,
    [string]$BoothCode,
    [switch]$PromptAdmin,
    [switch]$CheckOnly,
    [switch]$PrepareData,
    [switch]$ExistingAccount
)
$ErrorActionPreference = 'Stop'
$backendRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$moduleName = 'scripts.run_api_profile_load'
if ($ExistingAccount -or $CheckOnly) { $moduleName = 'scripts.run_http_profile_load' }
if ($PrepareData) { $moduleName = 'scripts.run_profile_load' }
if (-not $PrepareData -and ($CleanupRun -or $Journey -eq 'shared')) {
    throw 'API mode does not support CleanupRun/shared. Legacy seeding requires -PrepareData.'
}
if ($ExistingAccount -and $EnvFile) { throw 'ExistingAccount mode does not use an env file.' }
if ($PromptAdmin -and ($ExistingAccount -or $PrepareData -or $CheckOnly)) { throw 'PromptAdmin requires default API mode.' }
$runnerArgs = @('-m', $moduleName, '--profile', $Profile, '--journey', $Journey)
if ($Profile -eq 'mixed') {
    if ($ExistingAccount -or $PrepareData -or $CheckOnly -or $BoothCode -or $CleanupRun) {
        throw 'mixed creates its own test accounts and 50 temporary booths.'
    }
    $runnerArgs = @('-m', 'scripts.run_mixed_profile_load')
}
if ($BaseUrl) { $runnerArgs += @('--base-url', $BaseUrl) }
if ($PromptAdmin) { $runnerArgs += '--prompt-admin' }
if ($CleanupRun) { $runnerArgs += @('--cleanup-run', $CleanupRun) }
if ($EnvFile -and -not $CheckOnly) { $runnerArgs += @('--env-file', (Resolve-Path -LiteralPath $EnvFile).Path) }
if ($BoothCode -and -not $PrepareData) { $runnerArgs += @('--booth-code', $BoothCode) }
if ($CheckOnly -and -not $PrepareData) { $runnerArgs += '--check-only' }
Push-Location $backendRoot
try {
    $pythonPath = Join-Path $backendRoot '.venv/Scripts/python.exe'
    if (Test-Path -LiteralPath $pythonPath) {
        & $pythonPath @runnerArgs
    } else {
        & uv run python @runnerArgs
    }
    $runnerExit = $LASTEXITCODE
} finally {
    Pop-Location
}
exit $runnerExit
