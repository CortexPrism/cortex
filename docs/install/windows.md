# Installing CortexPrism on Windows

## Requirements

- Windows 10 or later (64-bit, x86_64)
- PowerShell 5.1+ (or PowerShell Core 7+)
- Git for Windows from https://git-scm.com/download/win

## Quick Install (PowerShell)

```powershell
iwr -Uri https://raw.githubusercontent.com/CortexPrism/cortex/main/install.ps1 -OutFile install.ps1
.\install.ps1
```

Or clone manually:

```powershell
git clone --depth 1 https://github.com/CortexPrism/cortex.git $env:USERPROFILE\.cortex
cd $env:USERPROFILE\.cortex
deno run --allow-all src/main.ts setup
```

## Install Deno (if needed)

```powershell
iwr https://deno.land/install.ps1 -useb | iex
```

Or use winget:

```powershell
winget install DenoLand.Deno
```

## PATH Setup

The Deno installer adds `$env:USERPROFILE\.deno\bin` to your user PATH automatically. Restart your terminal after installation.

Verify installation:

```powershell
deno --version
```

## Start Using CortexPrism

```powershell
cortex setup       # Configure your LLM provider
cortex chat        # Start chatting in the terminal
cortex serve       # Start the web UI at http://localhost:3000
```

## Windows-Specific Notes

- **Shell execution**: The shell tool uses PowerShell by default. Commands are filtered for safety (including Windows-specific dangerous commands).
- **Desktop automation**: Uses PowerShell + .NET `System.Windows.Forms`. Basic features (screenshot, click, type, clipboard) are available.
- **Docker sandbox**: Requires Docker Desktop with WSL2 backend from https://www.docker.com/products/docker-desktop/
- **Service installation**: Use `cortex daemon install` for Task Scheduler-based auto-start, or install NSSM for Windows Service integration.

## Uninstall

```powershell
Remove-Item -Recurse -Force $env:USERPROFILE\.cortex
Remove-Item -Force $env:USERPROFILE\.deno\bin\cortex.exe
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `deno: command not found` | Restart terminal or add `~/.deno/bin` to PATH manually |
| PowerShell execution policy | Run: `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser` |
| Docker Desktop not working | Ensure WSL2 is installed and enabled: `wsl --install` |
| Git not found | Install Git for Windows, ensure it's added to PATH |
| `cortex` not recognized | Add `%USERPROFILE%\.deno\bin` to PATH via System Environment Variables |
