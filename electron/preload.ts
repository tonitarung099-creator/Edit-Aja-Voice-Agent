import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('voiceAgent', {
  getRuntimeState: () => ipcRenderer.invoke('voice-agent:get-runtime-state'),
  getDownloadWindow: () => ipcRenderer.invoke('voice-agent:get-download-window'),
  listProfiles: () => ipcRenderer.invoke('voice-agent:list-profiles'),
  discoverChromeProfiles: () => ipcRenderer.invoke('voice-agent:discover-chrome-profiles'),
  saveProfile: (profile: unknown) => ipcRenderer.invoke('voice-agent:save-profile', profile),
  removeProfile: (slot: number) => ipcRenderer.invoke('voice-agent:remove-profile', slot),
});
