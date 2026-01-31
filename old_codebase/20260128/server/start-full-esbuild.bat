@echo off
echo ========================================
echo 🚀 Eden Ecosystem - Full Build and Start (esbuild)
echo ========================================
echo.

REM Change to project root directory
cd /d "%~dp0\.."
set PROJECT_ROOT=%CD%
set SERVER_DIR=%PROJECT_ROOT%\server
set FRONTEND_DIR=%PROJECT_ROOT%\frontend

echo 📁 Project Root: %PROJECT_ROOT%
echo 📁 Server Dir: %SERVER_DIR%
echo 📁 Frontend Dir: %FRONTEND_DIR%
echo.

REM Step 1: Build server with esbuild
echo ========================================
echo 🔨 Step 1: Building server with esbuild...
echo ========================================
cd /d "%SERVER_DIR%"
call npm run build:esbuild
if errorlevel 1 (
    echo ❌ Server build failed!
    pause
    exit /b 1
) else (
    echo ✅ Server built successfully with esbuild
)
echo.

REM Step 2: Clean Angular cache
echo ========================================
echo 🧹 Step 2: Cleaning Angular cache...
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

REM Step 3: Build Angular frontend
echo ========================================
echo 🔨 Step 3: Building Angular frontend...
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

REM Step 4: Kill existing Node.js processes on port 3000
echo ========================================
echo 🔪 Step 4: Killing existing Node.js processes on port 3000...
echo ========================================
taskkill /IM node.exe /F 2>nul
if errorlevel 1 (
    echo ℹ️  No existing Node.js processes found (or already stopped)
) else (
    echo ✅ Existing Node.js processes killed
)
timeout /t 2 /nobreak >nul
echo.

REM Step 5: Start the server (using compiled JavaScript)
echo ========================================
echo 🚀 Step 5: Starting Eden Ecosystem server (from compiled build)...
echo ========================================
cd /d "%SERVER_DIR%"
echo 📍 Running from: %SERVER_DIR%
echo 📍 Command: node dist/eden-sim-redis.js --enable-openai=true --mocked-llm=false --deployed-as-root=true --enable-https=true
echo.
echo ========================================
echo ✅ Server starting...
echo ========================================
echo.

node dist/eden-sim-redis.js --enable-openai=true --mocked-llm=false --deployed-as-root=true --enable-https=true

if errorlevel 1 (
    echo.
    echo ❌ Server failed to start!
    pause
    exit /b 1
)

