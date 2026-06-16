@echo off
REM Cortex Daemon - Windows Service Setup Script
REM Requires NSSM (https://nssm.cc) or use Task Scheduler as alternative
REM
REM Install NSSM: winget install nssm  OR  choco install nssm

set CORTEX_PATH=%USERPROFILE%\.cortex
set CORTEX_EXE=%CORTEX_PATH%\cortex.exe

REM Check if cortex binary exists
if not exist "%CORTEX_EXE%" (
    echo Error: %CORTEX_EXE% not found. Run `cortex update` first.
    exit /b 1
)

echo Choose service manager:
echo   [1] NSSM (Non-Sucking Service Manager)
echo   [2] Task Scheduler (built-in)
choice /c 12 /n /m "Enter choice (1 or 2): "

if errorlevel 2 goto task_scheduler
if errorlevel 1 goto nssm

:nssm
where nssm >nul 2>&1
if %errorlevel% neq 0 (
    echo NSSM not found. Install with: winget install nssm
    exit /b 1
)
nssm install Cortex "%CORTEX_EXE%" daemon run
nssm set Cortex AppDirectory "%CORTEX_PATH%"
nssm set Cortex Start SERVICE_AUTO_START
nssm start Cortex
echo Cortex daemon installed and started via NSSM.
exit /b 0

:task_scheduler
schtasks /create /tn "Cortex Daemon" /tr "\"%CORTEX_EXE%\" daemon run" /sc onlogon /delay 0001:00 /f
schtasks /run /tn "Cortex Daemon"
echo Cortex daemon installed via Task Scheduler. Starts on login (with 1min delay).
exit /b 0
