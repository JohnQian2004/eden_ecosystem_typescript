@echo off
cd frontend
echo Cleaning Angular cache...
call npx ng cache clean
if %ERRORLEVEL% NEQ 0 (
    echo Cache clean completed with warnings or errors, continuing...
)
echo.
echo Starting development server...
call npm run dev

