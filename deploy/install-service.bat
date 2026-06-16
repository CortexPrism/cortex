@echo off
REM Cortex - Windows Service Setup Script
REM Installs both daemon and web UI server as Windows services
REM Requires NSSM (https://nssm.cc) or use Task Scheduler as alternative
REM
REM Install NSSM: winget install nssm  OR  choco install nssm
REM
REM Usage: install-service.bat [--daemon-only] [--server-only]

set CORTEX_PATH=%USERPROFILE%\.cortex
set CORTEX_EXE=%CORTEX_PATH%\cortex.exe

REM Check if cortex binary exists
if not exist "%CORTEX_EXE%" (
    echo Error: %CORTEX_EXE% not found. Run `cortex update` first.
    exit /b 1
)

set INSTALL_DAEMON=1
set INSTALL_SERVER=1

if "%1"=="--daemon-only" set INSTALL_SERVER=0
if "%1"=="--server-only" set INSTALL_DAEMON=0
if "%2"=="--daemon-only" set INSTALL_SERVER=0
if "%2"=="--server-only" set INSTALL_DAEMON=0

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

if %INSTALL_DAEMON%==1 (
    nssm install CortexDaemon "%CORTEX_EXE%" daemon run
    nssm set CortexDaemon AppDirectory "%CORTEX_PATH%"
    nssm set CortexDaemon Start SERVICE_AUTO_START
    nssm start CortexDaemon
    echo Cortex daemon installed and started via NSSM.
)

if %INSTALL_SERVER%==1 (
    nssm install CortexServer "%CORTEX_EXE%" serve --port 3000 --host 127.0.0.1
    nssm set CortexServer AppDirectory "%CORTEX_PATH%"
    nssm set CortexServer Start SERVICE_AUTO_START
    nssm start CortexServer
    echo Cortex server installed and started via NSSM.
)

echo.
echo Service management:
echo   nssm status CortexDaemon
echo   nssm status CortexServer
echo   nssm stop CortexDaemon
echo   nssm stop CortexServer
echo   nssm restart CortexDaemon
echo   nssm restart CortexServer
exit /b 0

:task_scheduler
if %INSTALL_DAEMON%==1 (
    schtasks /create /tn "Cortex Daemon" /tr "\"%CORTEX_EXE%\" daemon run" /sc onlogon /delay 0001:00 /f
    schtasks /run /tn "Cortex Daemon"
    echo Cortex daemon installed via Task Scheduler. Starts on login (with 1min delay).
)

if %INSTALL_SERVER%==1 (
    schtasks /create /tn "Cortex Server" /tr "\"%CORTEX_EXE%\" serve --port 3000 --host 127.0.0.1" /sc onlogon /delay 0001:00 /f
    schtasks /run /tn "Cortex Server"
    echo Cortex server installed via Task Scheduler. Starts on login (with 1min delay).
)

echo.
echo Task management:
echo   schtasks /query /tn "Cortex Daemon"
echo   schtasks /query /tn "Cortex Server"
echo   schtasks /end /tn "Cortex Daemon"
echo   schtasks /end /tn "Cortex Server"
exit /b 0
