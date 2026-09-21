import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('voiceAgent', {
  getRuntimeState: () => ipcRenderer.invoke('voice-agent:get-runtime-state'),
  getDownloadWindow: () => ipcRenderer.invoke('voice-agent:get-download-window'),
  listProfiles: () => ipcRenderer.invoke('voice-agent:list-profiles'),
  discoverChromeProfiles: () => ipcRenderer.invoke('voice-agent:discover-chrome-profiles'),
  saveProfile: (profile: unknown) => ipcRenderer.invoke('voice-agent:save-profile', profile),
  removeProfile: (slot: number) => ipcRenderer.invoke('voice-agent:remove-profile', slot),

  chooseInputFolder: () => ipcRenderer.invoke('voice-agent:choose-input-folder'),
  scanInput: (folder: string) => ipcRenderer.invoke('voice-agent:scan-input', folder),
  startWorkflow: (folder: string) => ipcRenderer.invoke('voice-agent:start-workflow', folder),
  stopWorkflow: () => ipcRenderer.invoke('voice-agent:stop-workflow'),
  getWorkflow: () => ipcRenderer.invoke('voice-agent:get-workflow'),
  onRuntimeUpdate: (callback: (snapshot: unknown) => void) => {
    ipcRenderer.removeAllListeners('voice-agent:runtime-update');
    ipcRenderer.on('voice-agent:runtime-update', (_event, snapshot) => callback(snapshot));
  },
});
