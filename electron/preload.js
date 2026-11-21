// Tell the game it runs as the desktop app (enables desktop-only features)
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('SS_PLATFORM', 'desktop');
contextBridge.exposeInMainWorld('SSDesktop', {
  // Sign in with CutVid: opens CutVid's sign-in page in a window and resolves with the redirect URL.
  oauth: (url, redirect) => ipcRenderer.invoke('ss-oauth', url, redirect),
});
