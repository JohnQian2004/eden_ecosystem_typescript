@echo off
echo Freeing port 3000 if in use...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
  taskkill /PID %%a /F 2>nul
)
timeout /t 1 /nobreak >nul
echo.
echo Cleaning Angular cache and build artifacts...
call npx ng cache clean
if exist dist rmdir /s /q dist
if exist .angular rmdir /s /q .angular
echo.
echo Building Angular application...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo Build failed! Check errors above.
    pause
    exit /b 1
)
echo.
echo Build complete. Starting Angular dev server with HTTPS on port 3000...
echo.
echo Server will be available at:
echo   - https://localhost:3000
echo   - https://0.0.0.0:3000
echo.
echo Note: You may need to accept the self-signed SSL certificate in your browser.
echo.
call ng serve --host 0.0.0.0 --port 3000 --ssl --configuration development

