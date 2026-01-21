import { app, BrowserWindow, Menu, ipcMain, shell } from 'electron';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as path from 'path';
import * as net from 'net';
import * as fs from 'fs';

type LogLine = { ts: number; stream: 'stdout' | 'stderr'; line: string };

let mainWindow: BrowserWindow | null = null;
let logsWindow: BrowserWindow | null = null;
let serverProc: ChildProcessWithoutNullStreams | null = null;

const logBuffer: LogLine[] = [];
const MAX_LOG_LINES = 20_000;
const PREFERRED_PORT = 3000;

function pushLog(stream: 'stdout' | 'stderr', line: string) {
  const entry: LogLine = { ts: Date.now(), stream, line };
  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOG_LINES) logBuffer.splice(0, logBuffer.length - MAX_LOG_LINES);
  if (logsWindow && !logsWindow.isDestroyed()) {
    logsWindow.webContents.send('eden-log-line', entry);
  }
}

async function findFreePort(preferred: number): Promise<number> {
  // IMPORTANT: Eden server binds to :::PORT (IPv6 any). We must test on "::" too,
  // otherwise 127.0.0.1 can look free while :::PORT is already taken.
  return await new Promise<number>((resolve) => {
    const s = net.createServer();
    s.listen(preferred || 0, '::');
    s.on('listening', () => {
      const addr = s.address();
      const port = typeof addr === 'object' && addr ? addr.port : preferred || 0;
      s.close(() => resolve(port));
    });
    s.on('error', () => {
      // fallback to IPv4 loopback
      const s2 = net.createServer();
      s2.listen(preferred || 0, '127.0.0.1');
      s2.on('listening', () => {
        const addr = s2.address();
        const port = typeof addr === 'object' && addr ? addr.port : preferred || 0;
        s2.close(() => resolve(port));
      });
    });
  });
}

async function isPortFree(port: number): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '::');
  });
}

async function killPortOnWindows(port: number): Promise<boolean> {
  if (process.platform !== 'win32') return false;

  const killViaPowerShell = (): Promise<boolean> =>
    new Promise((resolve) => {
      const ps = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          // Kill ALL unique OwningProcess values listening on this port (IPv4 or IPv6).
          `$pids=(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | Sort-Object -Unique); if($pids){ $pids | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue; Write-Output $_ } }`
        ],
        { windowsHide: true }
      );

      let out = '';
      ps.stdout.on('data', (b) => (out += String(b)));
      ps.on('exit', () => {
        const killed = out
          .split(/\r?\n/)
          .map((l) => parseInt(l.trim(), 10))
          .filter((n) => Number.isFinite(n) && n > 0);
        if (killed.length > 0) {
          pushLog('stdout', `Killed PID(s) [${killed.join(', ')}] listening on port ${port}`);
          resolve(true);
          return;
        }
        resolve(false);
      });
      ps.on('error', () => resolve(false));
    });

  const killViaNetstat = (): Promise<boolean> =>
    new Promise((resolve) => {
      const cmd = spawn('cmd.exe', ['/c', `netstat -ano | findstr ":${port}" | findstr "LISTENING"`], { windowsHide: true });
      let out = '';
      cmd.stdout.on('data', (b) => (out += String(b)));
      cmd.on('exit', () => {
        const line = out.trim().split(/\r?\n/)[0] || '';
        const tokens = line.trim().split(/\s+/);
        const pid = parseInt(tokens[tokens.length - 1] || '', 10);
        if (!Number.isFinite(pid) || pid <= 0) return resolve(false);

        const tk = spawn('cmd.exe', ['/c', `taskkill /PID ${pid} /F`], { windowsHide: true });
        tk.on('exit', (code) => {
          if (code === 0) {
            pushLog('stdout', `Killed PID ${pid} listening on port ${port} (taskkill)`);
            resolve(true);
          } else {
            resolve(false);
          }
        });
        tk.on('error', () => resolve(false));
      });
      cmd.on('error', () => resolve(false));
    });

  const ok = await killViaPowerShell();
  if (ok) return true;
  return await killViaNetstat();
}

async function ensurePreferredPortAvailable(port: number): Promise<number> {
  if (await isPortFree(port)) return port;

  pushLog('stderr', `Port ${port} is in use. Attempting to free it...`);
  const killed = await killPortOnWindows(port);
  if (killed) {
    await new Promise((r) => setTimeout(r, 250));
    if (await isPortFree(port)) return port;
  }

  const fallback = await findFreePort(0);
  pushLog('stderr', `Port ${port} still unavailable. Falling back to port ${fallback}`);
  return fallback;
}

function getRepoRoot(): string {
  // In dev, app.getAppPath() -> desktop/
  // In packaged, app.getAppPath() -> .../resources/app.asar
  // We rely on extraResources for packaged paths; see getResourceRoot().
  return path.resolve(app.getAppPath(), '..');
}

function getResourceRoot(): string {
  // Packaged: resourcesPath points to .../Eden Simulator/resources
  return process.resourcesPath;
}

function getServerEntry(): { cwd: string; entry: string; frontendPath: string } {
  if (app.isPackaged) {
    const root = getResourceRoot();
    // NOTE: We do NOT package the Angular build. Provide it externally:
    // - set EDEN_FRONTEND_PATH env var, OR
    // - place it next to the installed app at ../frontend/dist/eden-sim-frontend
    const externalFrontend =
      process.env.EDEN_FRONTEND_PATH ||
      path.join(root, '..', 'frontend', 'dist', 'eden-sim-frontend');
    return {
      cwd: root,
      entry: path.join(root, 'server', 'dist', 'eden-sim-redis.js'),
      frontendPath: externalFrontend
    };
  }
  const root = getRepoRoot();
  return {
    cwd: root,
    entry: path.join(root, 'server', 'dist', 'eden-sim-redis.js'),
    frontendPath: path.join(root, 'frontend', 'dist', 'eden-sim-frontend')
  };
}

function frontendExists(frontendPath: string): boolean {
  try {
    return fs.existsSync(path.join(frontendPath, 'index.html'));
  } catch {
    return false;
  }
}

function ensureServerDataDir() {
  // server/dist/eden-sim-redis.js expects workflows under <__dirname>/data
  // i.e. server/dist/data/*.json
  if (app.isPackaged) return; // packaged uses extraResources to place data under server/dist/data
  try {
    const root = getRepoRoot();
    const srcDir = path.join(root, 'server', 'data');
    const dstDir = path.join(root, 'server', 'dist', 'data');
    if (!fs.existsSync(srcDir)) return;
    if (fs.existsSync(dstDir)) return;
    fs.mkdirSync(dstDir, { recursive: true });
    for (const name of fs.readdirSync(srcDir)) {
      const s = path.join(srcDir, name);
      const d = path.join(dstDir, name);
      if (fs.statSync(s).isFile()) fs.copyFileSync(s, d);
    }
    pushLog('stdout', `Copied server workflows: ${srcDir} -> ${dstDir}`);
  } catch (e: any) {
    pushLog('stderr', `Failed to prepare server/dist/data: ${e?.message || String(e)}`);
  }
}

function startServer(port: number) {
  if (serverProc) return;
  ensureServerDataDir();
  const { cwd, entry, frontendPath } = getServerEntry();

  // Electron can run as Node when ELECTRON_RUN_AS_NODE=1
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    HTTP_PORT: String(port),
    FRONTEND_PATH: frontendPath
  };

  pushLog('stdout', `Starting Eden server: ${entry}`);
  pushLog('stdout', `HTTP_PORT=${port}`);
  pushLog('stdout', `FRONTEND_PATH=${frontendPath}`);
  if (!frontendExists(frontendPath)) {
    pushLog('stderr', `Frontend not found at FRONTEND_PATH (missing index.html): ${frontendPath}`);
    pushLog('stderr', `Set EDEN_FRONTEND_PATH to your Angular dist folder, or place it at ../frontend/dist/eden-sim-frontend next to the installed app.`);
  }

  serverProc = spawn(process.execPath, [entry], { cwd, env });

  serverProc.stdout.on('data', (buf) => {
    String(buf)
      .split(/\r?\n/)
      .filter(Boolean)
      .forEach((l) => pushLog('stdout', l));
  });
  serverProc.stderr.on('data', (buf) => {
    String(buf)
      .split(/\r?\n/)
      .filter(Boolean)
      .forEach((l) => pushLog('stderr', l));
  });
  serverProc.on('exit', (code) => {
    pushLog('stderr', `Server exited with code ${code}`);
    serverProc = null;
  });
}

function stopServerGracefully() {
  if (!serverProc) return;
  try {
    pushLog('stdout', 'Stopping Eden server (SIGINT)...');
    serverProc.kill('SIGINT');
  } catch {}
  setTimeout(() => {
    if (!serverProc) return;
    try {
      pushLog('stderr', 'Forcing Eden server shutdown...');
      serverProc.kill();
    } catch {}
  }, 2500);
}

function createMainWindow(port: number) {
  const { frontendPath } = getServerEntry();
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // If Angular build isn't present, show a helpful local page instead of a blank/404.
  if (!frontendExists(frontendPath)) {
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'missing-frontend.html'));
  } else {
    mainWindow.loadURL(`http://localhost:${port}`);
  }
  mainWindow.on('closed', () => (mainWindow = null));
}

function createLogsWindow() {
  if (logsWindow && !logsWindow.isDestroyed()) {
    logsWindow.focus();
    return;
  }

  logsWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    title: 'Eden Server Logs',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  logsWindow.loadFile(path.join(__dirname, '..', 'renderer', 'logs.html'));
  logsWindow.on('closed', () => (logsWindow = null));
}

function buildMenu() {
  const template = [
    {
      label: 'Eden',
      submenu: [
        { role: 'quit' as const }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Open Logs',
          accelerator: 'Ctrl+Shift+L',
          click: () => createLogsWindow()
        },
        { role: 'reload' as const },
        { role: 'toggledevtools' as const }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template as any));
}

ipcMain.handle('eden-logs-snapshot', async () => logBuffer);
ipcMain.handle('eden-logs-clear', async () => {
  logBuffer.splice(0, logBuffer.length);
});

app.whenReady().then(async () => {
  buildMenu();
  const port = await ensurePreferredPortAvailable(PREFERRED_PORT);
  startServer(port);
  createMainWindow(port);
  createLogsWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopServerGracefully();
});


