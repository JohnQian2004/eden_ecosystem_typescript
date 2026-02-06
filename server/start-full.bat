@echo off
echo ========================================
echo 🚀 Eden Ecosystem - Full Build and Start
echo ========================================
echo.

REM Change to project root directory (go up 1 level from server)
cd /d "%~dp0\.."
set PROJECT_ROOT=%CD%
set SERVER_DIR=%PROJECT_ROOT%\server
set FRONTEND_DIR=%PROJECT_ROOT%\frontend

echo 📁 Project Root: %PROJECT_ROOT%
echo 📁 Server Dir: %SERVER_DIR%
echo 📁 Frontend Dir: %FRONTEND_DIR%
echo.

REM Step 1: Clean Angular cache
echo ========================================
echo 🧹 Step 1: Cleaning Angular cache...
echo ========================================
cd /d "%FRONTEND_DIR%"
if exist "%FRONTEND_DIR%" (
    if exist "%FRONTEND_DIR%\node_modules\.bin\ng.cmd" (
        call "%FRONTEND_DIR%\node_modules\.bin\ng.cmd" cache clean
        if errorlevel 1 (
            echo ⚠️  Warning: ng cache clean failed, trying npx...
            call npx --yes ng cache clean
        ) else (
            echo ✅ Angular cache cleaned successfully
        )
    ) else (
        echo ℹ️  Using npx ng cache clean...
        call npx --yes ng cache clean
        if errorlevel 1 (
            echo ⚠️  Warning: ng cache clean failed, continuing anyway...
        ) else (
            echo ✅ Angular cache cleaned successfully
        )
    )
) else (
    echo ⚠️  Frontend directory not found, skipping cache clean
)
echo.

REM Step 2: Build Angular frontend
echo ========================================
echo 🔨 Step 2: Building Angular frontend...
echo ========================================
cd /d "%FRONTEND_DIR%"
if not exist "%FRONTEND_DIR%" (
    echo ❌ Frontend directory not found: %FRONTEND_DIR%
    pause
    exit /b 1
)

if not exist "%FRONTEND_DIR%\package.json" (
    echo ❌ package.json not found in frontend directory
    pause
    exit /b 1
)

echo ℹ️  Using npm run build (recommended)...
call npm run build -- --configuration development
if errorlevel 1 (
    echo ⚠️  npm run build failed, trying ng directly...
            if exist "%FRONTEND_DIR%\node_modules\.bin\ng.cmd" (
                call "%FRONTEND_DIR%\node_modules\.bin\ng.cmd" build --configuration development
                if errorlevel 1 (
                    echo ℹ️  Trying npx ng build...
                    call npx --yes ng build --configuration development
                    if errorlevel 1 (
                        echo ❌ Angular build failed!
                        pause
                        exit /b 1
                    )
                )
            ) else (
                echo ℹ️  Trying npx ng build...
                call npx --yes ng build --configuration development
                if errorlevel 1 (
                    echo ❌ Angular build failed!
                    pause
                    exit /b 1
                )
            )
)

echo ✅ Angular frontend built successfully
echo.

REM Step 3: Kill processes on ports 3000 and 3001 (only those ports, NOT all node.js)
echo ========================================
echo 🔧 Step 3: Freeing ports 3000 and 3001...
echo ========================================
echo    Killing only processes listening on port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
    if not "%%a"=="0" taskkill /PID %%a /F 2>nul
)
echo    Killing only processes listening on port 3001...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do (
    if not "%%a"=="0" taskkill /PID %%a /F 2>nul
)
timeout /t 2 /nobreak >nul
echo    ✅ Ports freed (node.js processes elsewhere are untouched)
echo.

REM Step 4: Start Main Eden Server (port 3000) in new window
echo ========================================
echo 🚀 Step 4: Starting Main Eden Server (port 3000)...
echo ========================================
cd /d "%SERVER_DIR%"
start "Eden Main Server (Port 3000)" /D "%SERVER_DIR%" cmd /k "npx tsx eden-sim-redis.ts --enable-openai=true --mocked-llm=false --deployed-as-root=true --enable-https=true"
timeout /t 2 /nobreak >nul
echo    ✅ Main Server starting in separate window
echo.

REM Step 5: Start Media Server (port 3001) in new window
echo ========================================
echo 🚀 Step 5: Starting Media Server (port 3001)...
echo ========================================
cd /d "%PROJECT_ROOT%\media-server"
if exist "package.json" (
    start "Eden Media Server (Port 3001)" /D "%PROJECT_ROOT%\media-server" cmd /k "npm run dev"
    timeout /t 2 /nobreak >nul
    echo    ✅ Media Server starting in separate window
) else (
    echo    ⚠️  Media server not found, skipping...
)
echo.

REM Step 6: Start Angular dev server (port 4200) in new window
echo ========================================
echo 🚀 Step 6: Starting Angular dev server (port 4200)...
echo ========================================
cd /d "%FRONTEND_DIR%"
start "Eden Angular (Port 4200)" /D "%FRONTEND_DIR%" cmd /k "ng serve --host 0.0.0.0 --port 4200 --ssl --configuration development"
timeout /t 2 /nobreak >nul
echo    ✅ Angular dev server starting in separate window
echo.

echo ========================================
echo ✅ Main Server, Angular, and Media Server started:
echo    - Main Server: https://0.0.0.0:3000 (API)
echo    - Angular: https://0.0.0.0:4200 (frontend - proxies API to 3000)
echo    - Media Server: http://0.0.0.0:3001
echo ========================================
echo.
pause

