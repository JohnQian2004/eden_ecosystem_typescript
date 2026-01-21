"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('edenLogs', {
    onLogLine: (cb) => {
        electron_1.ipcRenderer.on('eden-log-line', (_evt, payload) => cb(payload));
    },
    getSnapshot: async () => {
        return await electron_1.ipcRenderer.invoke('eden-logs-snapshot');
    },
    clear: async () => {
        await electron_1.ipcRenderer.invoke('eden-logs-clear');
    }
});
