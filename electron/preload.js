// Tell the game it runs as the desktop app (enables desktop-only features)
const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('SS_PLATFORM', 'desktop');
