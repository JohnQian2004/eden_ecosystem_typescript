@echo off
REM ========================================
REM Eden Media Server Startup Script
REM ========================================

echo.
echo ========================================
echo   Starting Eden Media Server
echo   (Port 3001 + Embedded Redis)
echo ========================================
echo.

REM Step 1: Kill processes on port 3001
echo [1/2] Cleaning up port 3001...

REM Method 1: Try PowerShell (more reliable)
echo    Using PowerShell to kill processes on port 3001...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue | Where-Object {$_.State -eq 'Listen'} | ForEach-Object { $pid = $_.OwningProcess; Write-Host \"  Found PID $pid on port 3001\"; try { Stop-Process -Id $pid -Force -ErrorAction Stop; Write-Host \"  ✅ Killed PID $pid\" } catch { Write-Host \"  ⚠️  Failed to kill PID $pid\" } }" >nul 2>&1

REM Method 2: Fallback to netstat
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

REM Note: Only killing processes on port 3001, not all Node.js processes

echo    ✅ Port cleanup complete
timeout /t 2 /nobreak >nul

REM Step 2: Start the Media Server
echo [2/2] Starting Eden Media Server...
echo.
echo ========================================
echo   Server Configuration:
echo   - Port: 3001
echo   - Embedded Redis: Enabled
echo ========================================
echo.
echo Starting server...
echo (Press Ctrl+C to stop)
echo.

npm run dev

REM If server exits, show message
if errorlevel 1 (
    echo.
    echo ❌ Server exited with an error!
    pause
    exit /b 1
) else (
    echo.
    echo ✅ Server stopped normally
    pause
)

