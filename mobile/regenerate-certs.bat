@echo off
echo ========================================
echo 🔐 Regenerating Certificates with Server IP
echo ========================================
echo.

REM Change to server directory
cd /d "%~dp0\..\server"

echo 📍 Running from: %CD%
echo 📍 Server IP: 50.76.0.85
echo.

REM Set SERVER_IP environment variable
set SERVER_IP=50.76.0.85

echo 🔐 Generating certificates with IP address 50.76.0.85...
node scripts/generate-pki-certs.js

if errorlevel 1 (
    echo.
    echo ❌ Certificate generation failed!
    pause
    exit /b 1
)

echo.
echo ✅ Certificates regenerated successfully!
echo.
echo 📝 Next steps:
echo    1. Restart the server with --enable-https=true
echo    2. Trust the CA certificate (ca-cert.pem) in your browser/OS
echo    3. Mobile app will use https://50.76.0.85:3000
echo.
pause

