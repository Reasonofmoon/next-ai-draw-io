param(
    [switch]$SkipInstall,
    [int]$Port = 6002
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$demoUrl = "http://localhost:$Port/test-hwp"
$healthUrl = "http://localhost:$Port"
$envPath = Join-Path $repoRoot ".env.local"
$demoEnvTemplatePath = Join-Path $repoRoot "env.hwp-demo.example"
$nodeModulesPath = Join-Path $repoRoot "node_modules"

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Test-AppReady {
    param([string]$Url)

    try {
        $null = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
        return $true
    } catch {
        return $false
    }
}

Write-Step "HWP batch demo launcher"
Write-Host "Repo : $repoRoot"
Write-Host "URL  : $demoUrl"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js is not installed or not available in PATH."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm is not installed or not available in PATH."
}

if (-not (Test-Path $envPath)) {
    Write-Host ""
    Write-Host ".env.local not found." -ForegroundColor Yellow
    Write-Host "Create $envPath and configure one AI provider before the live demo." -ForegroundColor Yellow
    if (Test-Path $demoEnvTemplatePath) {
        Write-Host "Template available: $demoEnvTemplatePath" -ForegroundColor Yellow
        Write-Host "Copy it with: Copy-Item env.hwp-demo.example .env.local" -ForegroundColor Yellow
    }
    Write-Host "Quick start example:" -ForegroundColor Yellow
    Write-Host "  AI_PROVIDER=openai"
    Write-Host "  AI_MODEL=gpt-4.1-mini"
    Write-Host "  OPENAI_API_KEY=sk-..."
    exit 1
}

if (-not $SkipInstall -and -not (Test-Path $nodeModulesPath)) {
    Write-Step "Installing dependencies with npm install"
    Push-Location $repoRoot
    try {
        npm install
        if ($LASTEXITCODE -ne 0) {
            throw "npm install failed with exit code $LASTEXITCODE."
        }
    } finally {
        Pop-Location
    }
} elseif (-not (Test-Path $nodeModulesPath)) {
    Write-Host "node_modules is missing and -SkipInstall was specified." -ForegroundColor Yellow
    exit 1
}

if (Test-AppReady -Url $healthUrl) {
    Write-Step "Detected an existing local server"
} else {
    Write-Step "Starting Next.js dev server in a new PowerShell window"
    $command = "Set-Location '$repoRoot'; npm run dev"
    Start-Process powershell -ArgumentList @(
        "-NoExit",
        "-ExecutionPolicy", "Bypass",
        "-Command", $command
    ) | Out-Null

    Write-Step "Waiting for the app to become ready"
    $ready = $false
    for ($i = 0; $i -lt 90; $i++) {
        Start-Sleep -Seconds 1
        if (Test-AppReady -Url $healthUrl) {
            $ready = $true
            break
        }
    }

    if (-not $ready) {
        throw "The local app did not respond on $healthUrl within 90 seconds."
    }
}

Write-Step "Opening the demo page"
Start-Process $demoUrl

Write-Host ""
Write-Host "Live demo flow:" -ForegroundColor Green
Write-Host "1. Open /test-hwp and upload a .hwp or .hwpx worksheet."
Write-Host "2. Confirm the detected passage cards."
Write-Host "3. Click '🚀 N개 지문 파이프라인 실행' for AI generation + PNG rendering + HWP insertion."
Write-Host "4. Download the regenerated HWP and, if needed, the PNG ZIP."
