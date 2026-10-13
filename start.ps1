# AquaTrace — one-command launcher (Windows PowerShell 7+)
# Starts the FastAPI backend and the Vite dev server.

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$venv = Join-Path $backend ".venv"
$py = Join-Path $venv "Scripts\python.exe"

Write-Host "AquaTrace launcher" -ForegroundColor Cyan
Write-Host "Workspace: $root"

# --- Backend ---------------------------------------------------------------
if (-not (Test-Path $py)) {
    Write-Host "Creating Python virtual environment..." -ForegroundColor Yellow
    python -m venv $venv
}

Write-Host "Installing backend dependencies..." -ForegroundColor Yellow
& $py -m pip install --quiet --upgrade pip
& $py -m pip install --quiet -r (Join-Path $backend "requirements.txt")

# --- Frontend --------------------------------------------------------------
if (-not (Test-Path (Join-Path $frontend "node_modules"))) {
    Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
    npm install --prefix $frontend --no-audit --no-fund
}

# --- Start services --------------------------------------------------------
Write-Host "Starting backend on http://localhost:8000 ..." -ForegroundColor Green
$api = Start-Process -FilePath $py `
    -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000" `
    -WorkingDirectory $backend -PassThru

Write-Host "Starting frontend on http://localhost:5173 ..." -ForegroundColor Green
$web = Start-Process -FilePath "npm.cmd" `
    -ArgumentList "run", "dev", "--", "--host" `
    -WorkingDirectory $frontend -PassThru

Write-Host ""
Write-Host "AquaTrace is starting:" -ForegroundColor Cyan
Write-Host "  Dashboard : http://localhost:5173"
Write-Host "  API docs  : http://localhost:8000/docs"
Write-Host ""
Write-Host "Press Ctrl+C to stop both services."

try {
    Wait-Process -Id $api.Id, $web.Id
}
finally {
    foreach ($p in @($api, $web)) {
        if ($p -and -not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
    }
}
