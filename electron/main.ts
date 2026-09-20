import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDownloadWindowState } from '../shared/downloadWindow.js';
import { MAX_GEMINI_API_KEYS, MAX_GOOGLE_PROFILES } from '../shared/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createWindow() {
  const win = new BrowserWindow({
    width: 1560, height: 940, minWidth: 1180, minHeight: 720,
    backgroundColor: '#0a0d12',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0a0d12', symbolColor: '#d7dde8', height: 42 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  const dev = process.env.VITE_DEV_SERVER_URL;
  if (dev) win.loadURL(dev);
  else win.loadFile(path.join(__dirname, '../dist/index.html'));
}

ipcMain.handle('voice-agent:get-runtime-state', () => ({
  maxGoogleProfiles: MAX_GOOGLE_PROFILES,
  maxGeminiApiKeys: MAX_GEMINI_API_KEYS,
  version: app.getVersion(),
}));
ipcMain.handle('voice-agent:get-download-window', () => getDownloadWindowState());

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
