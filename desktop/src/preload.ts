import { contextBridge, ipcRenderer } from 'electron';

type LogLine = { ts: number; stream: 'stdout' | 'stderr'; line: string };

contextBridge.exposeInMainWorld('edenLogs', {
  onLogLine: (cb: (line: LogLine) => void) => {
    ipcRenderer.on('eden-log-line', (_evt, payload: LogLine) => cb(payload));
  },
  getSnapshot: async (): Promise<LogLine[]> => {
    return await ipcRenderer.invoke('eden-logs-snapshot');
  },
  clear: async (): Promise<void> => {
    await ipcRenderer.invoke('eden-logs-clear');
  }
});


