$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$docker = Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin\docker.exe'
if (-not (Test-Path -LiteralPath $docker)) { throw 'Docker Desktop is not installed.' }

function Test-DockerReady {
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $docker info --format '{{.ServerVersion}}' *> $null
        return $LASTEXITCODE -eq 0
    } finally {
        $ErrorActionPreference = $previousPreference
    }
}

if (-not (Test-DockerReady)) {
    Start-Process -FilePath (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe') -WindowStyle Hidden
}
$deadline = (Get-Date).AddMinutes(10)
do {
    if (Test-DockerReady) { break }
    if ((Get-Date) -ge $deadline) { throw 'Docker Desktop did not become ready.' }
    Start-Sleep -Seconds 5
} while ($true)

Set-Location -LiteralPath $workspace
& $docker compose --env-file .env --project-name rakazo `
    -f infra/compose/docker-compose.yml `
    -f infra/compose/docker-compose.laptop.yml `
    -f infra/compose/docker-compose.local.yml up --detach --no-build --wait --wait-timeout 300
if ($LASTEXITCODE -ne 0) { throw 'Rakazo could not start. Check Docker Compose status and logs.' }
