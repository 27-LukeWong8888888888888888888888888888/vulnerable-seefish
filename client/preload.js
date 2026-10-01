'use strict';

/*
 * Preload — exposes the narrow window.lab bridge.
 *
 * Runs with contextIsolation:false + sandbox:false in this intentional lab
 * build, so it shares the renderer context; with nodeIntegration:false the
 * page still has no require() and no Node APIs of its own. Only the exposed
 * keys below cross the boundary.
 *
 * V4: readFile(name) forwards `name` verbatim to the main-process handler,
 * which performs no path validation (see v4-file-read.js).
 */
const { contextBridge, ipcRenderer } = require('electron');

const lab = {
  api: (endpoint, payload, headers) => ipcRenderer.invoke('lab:api', endpoint, payload || {}, headers || {}),
  login: (username, password) => ipcRenderer.invoke('lab:login', username, password),
  logout: () => ipcRenderer.invoke('lab:logout'),
  loginState: () => ipcRenderer.invoke('lab:login-state'),
  appConfig: () => ipcRenderer.invoke('lab:app-config'),
  readFile: (requested) => ipcRenderer.invoke('lab:read-file', requested),
  smokeDone: (ok, detail) => ipcRenderer.send('lab:smoke-done', ok, detail)
};

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('lab', lab);
} else {
  // contextIsolation:false — same context as the page.
  window.lab = lab;
}
