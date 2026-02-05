@echo off
REM ========================================
REM Eden Ecosystem Server Startup Script
REM Starts both Media Server and Main Server
REM ========================================

echo.
echo ========================================
echo   Eden Ecosystem Server Startup
echo   (Media Server + Main Server + Redis)
echo ========================================
echo.

REM Get the script directory (project root)
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

REM Step 1: Kill processes on ports 3000 and 3001
echo [1/4] Cleaning up ports 3000 and 3001...

REM Method 1: Try PowerShell (more reliable)
echo    Using PowerShell to kill processes on ports 3000 and 3001...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-NetTCPConnection -LocalPort 3000,3001 -ErrorAction SilentlyContinue | Where-Object {$_.State -eq 'Listen'} | ForEach-Object { $pid = $_.OwningProcess; Write-Host \"  Found PID $pid on port $($_.LocalPort)\"; try { Stop-Process -Id $pid -Force -ErrorAction Stop; Write-Host \"  ✅ Killed PID $pid\" } catch { Write-Host \"  ⚠️  Failed to kill PID $pid\" } }" >nul 2>&1

REM Method 2: Fallback to netstat for port 3000
echo    Checking port 3000 with netstat...
set KILLED_3000=0
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
    if not "%%a"=="0" (
        echo    Found process on port 3000: PID %%a
        taskkill /PID %%a /F >nul 2>&1
        if not errorlevel 1 (
            echo    ✅ Killed PID %%a on port 3000
            set KILLED_3000=1
        )
    )
)

REM Method 3: Fallback to netstat for port 3001
echo    Checking port 3001 with netstat...
set KILLED_3001=0
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do (
    if not "%%a"=="0" (
        echo    Found process on port 3001: PID %%a
        taskkill /PID %%a /F >nul 2>&1
        if not errorlevel 1 (
            echo    ✅ Killed PID %%a on port 3001
            set KILLED_3001=1
        )
    )
)

REM Also kill all Node.js processes as final cleanup
taskkill /IM node.exe /F >nul 2>&1
if not errorlevel 1 (
    echo    ✅ Killed all remaining Node.js processes
)

echo    ✅ Port cleanup complete
timeout /t 2 /nobreak >nul

REM Step 2: Start Media Server (port 3001) with embedded Redis
echo [2/4] Starting Media Server (port 3001) with embedded Redis...
cd /d "%SCRIPT_DIR%media-server"
if not exist "src\index.ts" (
    echo    ❌ Error: Media server files not found!
    pause
    exit /b 1
)

REM Start media server in a new window
start "Eden Media Server (Port 3001 + Redis)" cmd /k "echo Starting Media Server with embedded Redis... && npm run dev"
timeout /t 3 /nobreak >nul
echo    ✅ Media Server starting in separate window

REM Step 3: Navigate to main server directory
echo [3/4] Preparing Main Server...
cd /d "%SCRIPT_DIR%server"
if not exist "eden-sim-redis.ts" (
    echo    ❌ Error: eden-sim-redis.ts not found in server directory!
    echo    Current directory: %CD%
    pause
    exit /b 1
)
echo    ✅ Found server files

REM Step 4: Start the Main Server (port 3000) with embedded Redis
echo [4/4] Starting Main Server (port 3000) with embedded Redis...
echo.
echo ========================================
echo   Server Configuration:
echo   - Media Server: Port 3001 (with Redis)
echo   - Main Server: Port 3000 (with Redis)
echo   - OpenAI: Enabled
echo   - Mocked LLM: Disabled
echo   - Deployed as Root: Enabled
echo ========================================
echo.
echo Starting Main Server...
echo (Media Server is running in a separate window)
echo (Press Ctrl+C to stop Main Server)
echo.

npx tsx eden-sim-redis.ts --enable-openai=true --mocked-llm=false --deployed-as-root=true

REM If server exits, show message
if errorlevel 1 (
    echo.
    echo ❌ Main Server exited with an error!
    echo ℹ️  Media Server may still be running in the other window
    pause
    exit /b 1
) else (
    echo.
    echo ✅ Main Server stopped normally
    echo ℹ️  Remember to close the Media Server window if it's still running
    pause
)

