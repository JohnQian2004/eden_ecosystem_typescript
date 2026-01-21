## Eden Simulator Desktop (Windows App)

This wraps the existing Eden Node server into a Windows desktop app (Electron) and provides a **searchable server console window**.

**Important:** this desktop app **does NOT package the Angular frontend**. You must provide the Angular build externally.

### Dev run

From repo root:

```powershell
cd desktop
npm install
npm run dev
```

### What it does
- Starts `server/dist/eden-sim-redis.js` as a child process
- Forces:
  - `HTTP_PORT` to an available local port (prefers `3000`)
  - `FRONTEND_PATH` to `frontend/dist/eden-sim-frontend` (dev) or external path (packaged)
- Opens:
  - **Main app window** (Eden UI)
  - **Logs window** (search/filter, clear)

### Provide the Angular build (packaged app)

Either:
- Set env var `EDEN_FRONTEND_PATH` to your Angular dist folder, **or**
- Place the folder next to the installed app at `../frontend/dist/eden-sim-frontend`

### Build Windows installer

```powershell
cd desktop
npm install
npm run dist:win
```


