// SpaceShip desktop app (Windows / macOS / Linux)
const { app, BrowserWindow, shell, ipcMain, nativeImage } = require('electron');

const CUTVID_AUTH = 'https://btrwboxwbinqewgvlcal.supabase.co/auth/v1/oauth/authorize';
const OAUTH_REDIRECT = 'com.spaceship.game://oauth';
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 800, minHeight: 500,
    backgroundColor: '#05021a', title: 'SpaceShip', autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'assets', 'icon-only.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, '..', 'www', 'index.html'));
  // F11 / Alt+Enter: fullscreen, F12: devtools
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.alt && input.key === 'Enter')) { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (input.key === 'F12') win.webContents.toggleDevTools();
  });
  // open external links in the browser
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

// "Sign in with CutVid": show CutVid's sign-in page in its own window and catch the redirect back.
ipcMain.handle('ss-set-icon', (event, dataUrl) => {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) return false;
  const img = nativeImage.createFromDataURL(dataUrl); if (img.isEmpty()) return false;
  const win = BrowserWindow.fromWebContents(event.sender); if (win) win.setIcon(img);
  if (process.platform === 'darwin' && app.dock) app.dock.setIcon(img);
  return true;
});

ipcMain.handle('ss-oauth', (event, url, redirect) => new Promise((resolve, reject) => {
  if (typeof url !== 'string' || !url.startsWith(CUTVID_AUTH + '?') || redirect !== OAUTH_REDIRECT) return reject(new Error('oauth_failed'));
  const parent = BrowserWindow.fromWebContents(event.sender);
  const win = new BrowserWindow({ width: 480, height: 720, parent, modal: true, autoHideMenuBar: true, title: 'CutVid', backgroundColor: '#0b0c10',
    webPreferences: { contextIsolation: true, sandbox: true, partition: 'persist:cutvid' } });
  // Google refuses sign-in inside apps that announce themselves as Electron.
  win.webContents.setUserAgent(win.webContents.getUserAgent().replace(/\s*Electron\/\S+/, '').replace(/\s*SpaceShip\/\S+/, ''));
  let done = false;
  const check = (e, target) => {
    if (target && target.startsWith(OAUTH_REDIRECT)) { if (e && e.preventDefault) e.preventDefault(); done = true; resolve(target); win.close(); }
  };
  win.webContents.on('will-redirect', (e, target) => check(e, target));
  win.webContents.on('will-navigate', (e, target) => check(e, target));
  win.webContents.on('did-fail-load', (e, code, desc, target) => check(null, target));
  win.webContents.setWindowOpenHandler(({ url: u }) => { win.loadURL(u); return { action: 'deny' }; });
  win.on('closed', () => { if (!done) reject(new Error('oauth_cancelled')); });
  win.removeMenu();
  win.loadURL(url);
}));

// sound may start before the first click (the ItamaRos Games logo music when the app opens)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
