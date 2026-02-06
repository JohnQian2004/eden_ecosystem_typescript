@echo off
echo Cleaning Angular cache and build artifacts...
call npx ng cache clean
if exist dist rmdir /s /q dist
if exist .angular rmdir /s /q .angular
echo.
echo Cache cleaned. Building...
call npm run build
echo.
echo Build complete. Starting dev server...
echo.
echo IMPORTANT: After server starts, in your browser:
echo 1. Open DevTools (F12)
echo 2. Go to Network tab
echo 3. Check "Disable cache"
echo 4. Hard refresh (Ctrl+Shift+R)
echo.
call npm run start:http

