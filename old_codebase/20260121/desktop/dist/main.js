"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const net = __importStar(require("net"));
const fs = __importStar(require("fs"));
let mainWindow = null;
let logsWindow = null;
let serverProc = null;
const logBuffer = [];
const MAX_LOG_LINES = 20000;
const PREFERRED_PORT = 3000;
function pushLog(stream, line) {
    const entry = { ts: Date.now(), stream, line };
    logBuffer.push(entry);
    if (logBuffer.length > MAX_LOG_LINES)
        logBuffer.splice(0, logBuffer.length - MAX_LOG_LINES);
    if (logsWindow && !logsWindow.isDestroyed()) {
        logsWindow.webContents.send('eden-log-line', entry);
    }
}
async function findFreePort(preferred) {
    // IMPORTANT: Eden server binds to :::PORT (IPv6 any). We must test on "::" too,
    // otherwise 127.0.0.1 can look free while :::PORT is already taken.
    return await new Promise((resolve) => {
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
async function isPortFree(port) {
    return await new Promise((resolve) => {
        const s = net.createServer();
        s.once('error', () => resolve(false));
        s.once('listening', () => s.close(() => resolve(true)));
        s.listen(port, '::');
    });
}
async function killPortOnWindows(port) {
    if (process.platform !== 'win32')
        return false;
    const killViaPowerShell = () => new Promise((resolve) => {
        const ps = (0, child_process_1.spawn)('powershell.exe', [
            '-NoProfile',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            // Kill ALL unique OwningProcess values listening on this port (IPv4 or IPv6).
            `$pids=(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | Sort-Object -Unique); if($pids){ $pids | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue; Write-Output $_ } }`
        ], { windowsHide: true });
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
    const killViaNetstat = () => new Promise((resolve) => {
        const cmd = (0, child_process_1.spawn)('cmd.exe', ['/c', `netstat -ano | findstr ":${port}" | findstr "LISTENING"`], { windowsHide: true });
        let out = '';
        cmd.stdout.on('data', (b) => (out += String(b)));
        cmd.on('exit', () => {
            const line = out.trim().split(/\r?\n/)[0] || '';
            const tokens = line.trim().split(/\s+/);
            const pid = parseInt(tokens[tokens.length - 1] || '', 10);
            if (!Number.isFinite(pid) || pid <= 0)
                return resolve(false);
            const tk = (0, child_process_1.spawn)('cmd.exe', ['/c', `taskkill /PID ${pid} /F`], { windowsHide: true });
            tk.on('exit', (code) => {
                if (code === 0) {
                    pushLog('stdout', `Killed PID ${pid} listening on port ${port} (taskkill)`);
                    resolve(true);
                }
                else {
                    resolve(false);
                }
            });
            tk.on('error', () => resolve(false));
        });
        cmd.on('error', () => resolve(false));
    });
    const ok = await killViaPowerShell();
    if (ok)
        return true;
    return await killViaNetstat();
}
async function ensurePreferredPortAvailable(port) {
    if (await isPortFree(port))
        return port;
    pushLog('stderr', `Port ${port} is in use. Attempting to free it...`);
    const killed = await killPortOnWindows(port);
    if (killed) {
        await new Promise((r) => setTimeout(r, 250));
        if (await isPortFree(port))
            return port;
    }
    const fallback = await findFreePort(0);
    pushLog('stderr', `Port ${port} still unavailable. Falling back to port ${fallback}`);
    return fallback;
}
function getRepoRoot() {
    // In dev, app.getAppPath() -> desktop/
    // In packaged, app.getAppPath() -> .../resources/app.asar
    // We rely on extraResources for packaged paths; see getResourceRoot().
    return path.resolve(electron_1.app.getAppPath(), '..');
}
function getResourceRoot() {
    // Packaged: resourcesPath points to .../Eden Simulator/resources
    return process.resourcesPath;
}
function getServerEntry() {
    if (electron_1.app.isPackaged) {
        const root = getResourceRoot();
        // NOTE: We do NOT package the Angular build. Provide it externally:
        // - set EDEN_FRONTEND_PATH env var, OR
        // - place it next to the installed app at ../frontend/dist/eden-sim-frontend
        const externalFrontend = process.env.EDEN_FRONTEND_PATH ||
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
function frontendExists(frontendPath) {
    try {
        return fs.existsSync(path.join(frontendPath, 'index.html'));
    }
    catch {
        return false;
    }
}
function ensureServerDataDir() {
    // server/dist/eden-sim-redis.js expects workflows under <__dirname>/data
    // i.e. server/dist/data/*.json
    if (electron_1.app.isPackaged)
        return; // packaged uses extraResources to place data under server/dist/data
    try {
        const root = getRepoRoot();
        const srcDir = path.join(root, 'server', 'data');
        const dstDir = path.join(root, 'server', 'dist', 'data');
        if (!fs.existsSync(srcDir))
            return;
        if (fs.existsSync(dstDir))
            return;
        fs.mkdirSync(dstDir, { recursive: true });
        for (const name of fs.readdirSync(srcDir)) {
            const s = path.join(srcDir, name);
            const d = path.join(dstDir, name);
            if (fs.statSync(s).isFile())
                fs.copyFileSync(s, d);
        }
        pushLog('stdout', `Copied server workflows: ${srcDir} -> ${dstDir}`);
    }
    catch (e) {
        pushLog('stderr', `Failed to prepare server/dist/data: ${e?.message || String(e)}`);
    }
}
function startServer(port) {
    if (serverProc)
        return;
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
    serverProc = (0, child_process_1.spawn)(process.execPath, [entry], { cwd, env });
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
    if (!serverProc)
        return;
    try {
        pushLog('stdout', 'Stopping Eden server (SIGINT)...');
        serverProc.kill('SIGINT');
    }
    catch { }
    setTimeout(() => {
        if (!serverProc)
            return;
        try {
            pushLog('stderr', 'Forcing Eden server shutdown...');
            serverProc.kill();
        }
        catch { }
    }, 2500);
}
function createMainWindow(port) {
    const { frontendPath } = getServerEntry();
    mainWindow = new electron_1.BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });
    // Open external links in default browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        electron_1.shell.openExternal(url);
        return { action: 'deny' };
    });
    // If Angular build isn't present, show a helpful local page instead of a blank/404.
    if (!frontendExists(frontendPath)) {
        mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'missing-frontend.html'));
    }
    else {
        mainWindow.loadURL(`http://localhost:${port}`);
    }
    mainWindow.on('closed', () => (mainWindow = null));
}
function createLogsWindow() {
    if (logsWindow && !logsWindow.isDestroyed()) {
        logsWindow.focus();
        return;
    }
    logsWindow = new electron_1.BrowserWindow({
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
                { role: 'quit' }
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
                { role: 'reload' },
                { role: 'toggledevtools' }
            ]
        }
    ];
    electron_1.Menu.setApplicationMenu(electron_1.Menu.buildFromTemplate(template));
}
electron_1.ipcMain.handle('eden-logs-snapshot', async () => logBuffer);
electron_1.ipcMain.handle('eden-logs-clear', async () => {
    logBuffer.splice(0, logBuffer.length);
});
electron_1.app.whenReady().then(async () => {
    buildMenu();
    const port = await ensurePreferredPortAvailable(PREFERRED_PORT);
    startServer(port);
    createMainWindow(port);
    createLogsWindow();
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
electron_1.app.on('before-quit', () => {
    stopServerGracefully();
});
