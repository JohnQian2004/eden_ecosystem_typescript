const { exec } = require('child_process');

console.log('🔪 Killing all Node.js processes on port 3000...');

// Kill all node processes forcefully
exec('taskkill /IM node.exe /F', (error, stdout, stderr) => {
  if (error) {
    console.log('⚠️  No Node.js processes found or already killed');
  } else {
    console.log('✅ Node.js processes killed successfully');
  }

  // Small delay to ensure processes are fully terminated
  setTimeout(() => {
    console.log('🚀 Starting Eden Ecosystem server...');
  }, 1000);
});