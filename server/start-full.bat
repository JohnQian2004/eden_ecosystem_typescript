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

REM Step 3: Kill processes on port 3000 (except node.js)
echo ========================================
echo 🔧 Step 3: Checking port 3000...
echo ========================================
powershell -ExecutionPolicy Bypass -File "%SERVER_DIR%\kill-port-3000.ps1"
echo.

REM Step 4: Start the server
echo ========================================
echo 🚀 Step 4: Starting Eden Ecosystem server...
echo ========================================
cd /d "%SERVER_DIR%"
echo 📍 Running from: %CD%
echo 📍 Command: npx tsx eden-sim-redis.ts --enable-openai=true --mocked-llm=false --deployed-as-root=true --enable-https=true
echo.
echo ========================================
echo ✅ Server starting on 0.0.0.0 (all interfaces)...
echo ========================================
echo.

REM Set HOST environment variable to bind to all interfaces
set HOST=0.0.0.0
npx tsx eden-sim-redis.ts --enable-openai=true --mocked-llm=false --deployed-as-root=true --enable-https=true

if errorlevel 1 (
    echo.
    echo ❌ Server failed to start!
    pause
    exit /b 1
)

