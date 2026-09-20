import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('voiceAgent', {
  getRuntimeState: () => ipcRenderer.invoke('voice-agent:get-runtime-state'),
  getDownloadWindow: () => ipcRenderer.invoke('voice-agent:get-download-window'),
});
