@echo off
REM ========================================
REM Eden Ecosystem - Full Build and Start
REM Builds frontend and starts server
REM ========================================

echo.
echo ========================================
echo   Eden Ecosystem - Full Build and Start
echo ========================================
echo.

REM Get the script directory (project root)
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

REM Step 1: Kill existing Node.js processes
echo [1/4] Cleaning up existing processes...
taskkill /IM node.exe /F >nul 2>&1
timeout /t 2 /nobreak >nul
echo    ✅ Cleaned up

REM Step 2: Build frontend (if needed)
echo [2/4] Building Angular frontend...
cd /d "%SCRIPT_DIR%frontend"
if not exist "node_modules" (
    echo    ⚠️  node_modules not found, installing dependencies...
    call npm install
    if errorlevel 1 (
        echo    ❌ npm install failed!
        pause
        exit /b 1
    )
)

echo    Building frontend...
call npm run build -- --configuration development
if errorlevel 1 (
    echo    ⚠️  Build failed, trying alternative method...
    if exist "node_modules\.bin\ng.cmd" (
        call "node_modules\.bin\ng.cmd" build --configuration development
    ) else (
        call npx --yes ng build --configuration development
    )
    if errorlevel 1 (
        echo    ❌ Frontend build failed!
        pause
        exit /b 1
    )
)
echo    ✅ Frontend built successfully

REM Step 3: Navigate to server directory
echo [3/4] Preparing server...
cd /d "%SCRIPT_DIR%server"
if not exist "eden-sim-redis.ts" (
    echo    ❌ Error: eden-sim-redis.ts not found!
    pause
    exit /b 1
)
echo    ✅ Server files found

REM Step 4: Start the server
echo [4/4] Starting Eden Ecosystem server...
echo.
echo ========================================
echo   Server Configuration:
echo   - OpenAI: Enabled
echo   - Mocked LLM: Disabled
echo   - Deployed as Root: Enabled
echo   - Port: 3000
echo ========================================
echo.
echo Starting server...
echo (Press Ctrl+C to stop)
echo.

npx tsx eden-sim-redis.ts --enable-openai=true --mocked-llm=false --deployed-as-root=true

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

