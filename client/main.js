'use strict';

/*
 * Electron main process — campus lab booking desktop client (Phase 6).
 *
 * Intentionally insecure lab build (V4): webPreferences use
 * contextIsolation:false + sandbox:false so the preload shares the renderer
 * context and the V4 file-read bridge is reachable as a plain window global.
 * nodeIntegration stays OFF — the page itself still has no Node require().
 * See docs/vulnerabilities/V4-UNSAFE-IPC.md. Do not "harden" these settings.
 */
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { ApiClient } = require('./api-client.js');
const { readManual } = require('./v4-file-read.js');

const APP_CONFIG = require('./resources/lab-app-config.json');
const BASE = process.env.LAB_API_BASE || APP_CONFIG.apiBase || 'http://127.0.0.1:3000';
const SMOKE = process.env.LAB_ELECTRON_SMOKE === '1';

if (process.env.LAB_ELECTRON_NO_SANDBOX === '1') {
  // Lab convenience on hosts without the setuid chrome-sandbox helper.
  app.commandLine.appendSwitch('no-sandbox');
}

const api = new ApiClient(BASE);

function createWindow() {
  const win = new BrowserWindow({
    width: 1120,
    height: 860,
    show: !SMOKE,
    autoHideMenuBar: true,
    webPreferences: {
      // INTENTIONALLY INSECURE (coursework lab — V4):
      contextIsolation: false,
      sandbox: false,
      nodeIntegration: false, // do NOT enable; renderer gets no Node APIs
      preload: path.join(__dirname, 'preload.js')
    }
  });
  win.loadFile(path.join(__dirname, 'renderer', SMOKE ? 'smoke.html' : 'index.html'));
  return win;
}

app.whenReady().then(() => {
  // API bridge — the renderer's only network path (main process performs the
  // HTTP + RC4 work; the renderer never sees the key or ciphertext).
  ipcMain.handle('lab:api', (event, endpoint, payload, headers) =>
    api.call(endpoint, payload || {}, headers || {}));
  ipcMain.handle('lab:login', (event, username, password) => api.login(username, password));
  ipcMain.handle('lab:logout', () => api.logout());
  ipcMain.handle('lab:login-state', () => ({ user: api.user, hasToken: Boolean(api.token) }));

  // V1 coursework artifact: synthetic field-service token shipped in local
  // app resources. Phase 7 packages these resources into the ASAR; the
  // recovery-from-package proof completes there.
  ipcMain.handle('lab:app-config', () => APP_CONFIG);

  // VULN-V4 sink — renderer-controlled filename, no path validation.
  ipcMain.handle('lab:read-file', (event, requested) => readManual(requested));

  if (SMOKE) {
    ipcMain.on('lab:smoke-done', (event, ok, detail) => {
      console.log('SMOKE ' + (ok ? 'OK' : 'FAILED') + (detail ? ' — ' + detail : ''));
      app.exit(ok ? 0 : 1);
    });
    setTimeout(() => {
      console.error('SMOKE TIMEOUT — renderer never reported');
      app.exit(2);
    }, 60000);
  }

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
