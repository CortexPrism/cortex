# CortexPrism Installation (PowerShell)

param(
    [string]$Repo = "CortexPrism/cortex",
    [string]$Branch = "main",
    [string]$InstallDir = ""
)

$ErrorActionPreference = "Stop"

$BOLD = "`e[1m"
$DIM = "`e[2m"
$GREEN = "`e[0;32m"
$CYAN = "`e[0;36m"
$YELLOW = "`e[0;33m"
$RED = "`e[0;31m"
$NC = "`e[0m"

function Write-Info { Write-Host "$GREEN$args$NC" }
function Write-Warn { Write-Host "${YELLOW}WARN:${NC} $args" }
function Write-Header { Write-Host "`n${BOLD}${CYAN}==> $args${NC}" }
function Write-ErrorExit { Write-Host "${RED}ERROR:${NC} $args"; exit 1 }

$CORTEX_DIR = if ($InstallDir) { $InstallDir } else { Join-Path $env:USERPROFILE ".cortex" }
$DENO_DIR = Join-Path $env:USERPROFILE ".deno"
$BIN_DIR = Join-Path $DENO_DIR "bin"
$CORTEX_EXE = Join-Path $BIN_DIR "cortex.exe"

Write-Host @"

  ╔══════════════════════════════════════╗
  ║       CortexPrism Installer         ║
  ║   Open-Source Agentic Harness       ║
  ║   24 LLM Providers · 10 Channels    ║
  ║   Vector Memory · Voice · MCP       ║
  ╚══════════════════════════════════════╝

"@

Write-Info "  OS:      Windows $(Get-CimInstance Win32_OperatingSystem).Version"
Write-Info "  Arch:    x86_64"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-ErrorExit "Git for Windows is required. Install from https://git-scm.com/download/win"
}
Write-Info "  ✓ Git found"

Write-Header "Checking Deno"
if (-not (Get-Command deno -ErrorAction SilentlyContinue)) {
    Write-Header "Installing Deno"
    Write-Host "$DIM  Downloading Deno installer...$NC"
    try {
        iwr https://deno.land/install.ps1 -useb | iex
    } catch {
        Write-ErrorExit "Deno installation failed. Install manually: https://docs.deno.com/runtime/getting_started/installation"
    }

    if (-not (Get-Command deno -ErrorAction SilentlyContinue)) {
        $env:Path = "$BIN_DIR;$env:Path"
        if (-not (Get-Command deno -ErrorAction SilentlyContinue)) {
            Write-ErrorExit "Deno installation failed. Install manually: https://docs.deno.com/runtime/getting_started/installation"
        }
    }
}
Write-Info "  ✓ Deno $(deno --version | Select-Object -First 1) found"

Write-Header "Downloading CortexPrism"
if (Test-Path (Join-Path $CORTEX_DIR ".git")) {
    Write-Host "$DIM  Updating existing installation...$NC"
    Push-Location $CORTEX_DIR
    git pull --ff-only origin $Branch 2>$null
    Pop-Location
} else {
    Write-Host "$DIM  Target: $CORTEX_DIR$NC"
    New-Item -ItemType Directory -Force -Path $CORTEX_DIR | Out-Null
    git clone --depth 1 -b $Branch "https://github.com/${Repo}.git" $CORTEX_DIR 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-ErrorExit "Failed to clone repository. Check your internet connection."
    }
}

Push-Location $CORTEX_DIR

Write-Header "Initializing databases"
Write-Host "$DIM  Running migrations...$NC"
try {
    deno run --allow-all src/db/migrate.ts 2>$null
} catch {
    Write-Warn "Migration step had warnings — this is usually fine for a first install"
}

Write-Info "  ✓ CortexPrism installed successfully!"

Pop-Location

Write-Header "Creating cortex command"
New-Item -ItemType Directory -Force -Path $BIN_DIR | Out-Null
$wrapper = "@echo off`r`ndeno run --allow-all `"$CORTEX_DIR\src\main.ts`" %*`r`n"
Set-Content -Path "$CORTEX_EXE.bat" -Value $wrapper

if (Test-Path $CORTEX_EXE) {
    Remove-Item $CORTEX_EXE -Force
}

$wshell = New-Object -ComObject WScript.Shell
$shortcut = $wshell.CreateShortcut($CORTEX_EXE.Replace(".exe", ".lnk"))
$shortcut.TargetPath = "deno.exe"
$shortcut.Arguments = "run --allow-all `"$CORTEX_DIR\src\main.ts`""
$shortcut.Save()

Write-Info "  ✓ cortex command created at $CORTEX_EXE.bat"

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$BIN_DIR*") {
    [Environment]::SetEnvironmentVariable("Path", "$BIN_DIR;$userPath", "User")
    Write-Warn "  Added $BIN_DIR to user PATH. Restart your terminal for changes to take effect."
}

Write-Host @"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  CortexPrism is ready!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Quick start:

  cortex setup         Configure your LLM provider
  cortex chat          Start chatting
  cortex serve         Start web UI at http://localhost:3000

What's new in v0.42:

  • 24 LLM providers (add your own too)
  • 10 channel integrations (Discord, Slack, Telegram, Teams, etc.)
  • Pluggable memory backends (SQLite, Qdrant, ChromaDB, Pinecone)
  • Chrome Bridge MCP for browser automation
  • Voice & speech (STT/TTS via OpenAI, ElevenLabs)
  • Agent personality system (SOUL.md)
  • AI-driven personalization questionnaire

Package manager installs:

  winget install CortexPrism.Cortex
  scoop bucket add cortex https://github.com/CortexPrism/scoop-bucket
  choco install cortexprism
  brew install CortexPrism/tap/cortex

Documentation:
  https://cortexprism.io/getting-started

Installed at: $CORTEX_DIR
Run with:     cortex <command>
Config:       ~\.cortex\config.json

"@
