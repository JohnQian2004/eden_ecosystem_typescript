@echo off
echo 🔪 Killing existing Node.js processes on port 3000...
taskkill /IM node.exe /F 2>nul
timeout /t 2 /nobreak >nul

echo 🚀 Starting Eden Ecosystem server...
npx tsx eden-sim-redis.ts --enable-openai=true --mocked-llm=false --deployed-as-root=true

