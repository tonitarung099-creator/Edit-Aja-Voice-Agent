import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDownloadWindowState } from '../shared/downloadWindow.js';
import { MAX_GEMINI_API_KEYS, MAX_GOOGLE_PROFILES } from '../shared/constants.js';
import { discoverChromeProfiles } from './chromeProfiles.js';
import { loadProfiles, removeProfile, saveProfile } from './profileRegistry.js';
import { loadSettings, saveSettings } from './settingsStore.js';
import { JobController } from './jobController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const jobController = new JobController();

function createWindow() {
  const win = new BrowserWindow({
    width: 1560, height: 940, minWidth: 1180, minHeight: 720,
    backgroundColor: '#0a0d12',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0a0d12', symbolColor: '#d7dde8', height: 42 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const dev = process.env.VITE_DEV_SERVER_URL;
  if (dev) win.loadURL(dev);
  else win.loadFile(path.join(__dirname, '../../dist/index.html'));
}

ipcMain.handle('voice-agent:get-runtime-state', () => ({
  maxGoogleProfiles: MAX_GOOGLE_PROFILES,
  maxGeminiApiKeys: MAX_GEMINI_API_KEYS,
  version: app.getVersion(),
}));
ipcMain.handle('voice-agent:get-download-window', () => getDownloadWindowState());
ipcMain.handle('voice-agent:list-profiles', () => loadProfiles());
ipcMain.handle('voice-agent:discover-chrome-profiles', () => discoverChromeProfiles());
ipcMain.handle('voice-agent:save-profile', (_event, profile) => saveProfile(profile));
ipcMain.handle('voice-agent:remove-profile', (_event, slot) => removeProfile(Number(slot)));
ipcMain.handle('voice-agent:get-settings', () => loadSettings());
ipcMain.handle('voice-agent:save-settings', (_event, settings) => saveSettings(settings));

ipcMain.handle('voice-agent:choose-input-folder', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Pilih folder INPUT PART',
    properties: ['openDirectory'],
  });
  return result.canceled ? null : (result.filePaths[0] ?? null);
});
ipcMain.handle('voice-agent:scan-input', (_event, folder: string) => jobController.scan(folder));
ipcMain.handle('voice-agent:start-workflow', (_event, folder: string) => jobController.start(folder));
ipcMain.handle('voice-agent:stop-workflow', () => jobController.stop());
ipcMain.handle('voice-agent:get-workflow', () => jobController.getSnapshot());

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
