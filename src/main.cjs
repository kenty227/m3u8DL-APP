const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { DownloadService } = require('./service.cjs');
const { validateExecutable } = require('./platform.cjs');
let window, service, tray, quitting = false, broadcasting;
const smokeMode = process.argv.includes('--smoke');
if (smokeMode) app.setPath('userData', process.env.M3U8_STUDIO_SMOKE_DIR || path.join(process.cwd(), '.smoke', 'ui-state'));
const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();

function showWindow() { if (window) { window.show(); if (window.isMinimized()) window.restore(); window.focus(); } }
app.on('second-instance', showWindow);

function createWindow() {
  window = new BrowserWindow({ width: 1260, height: 870, minWidth: 1000, minHeight: 720, icon: path.join(__dirname,'renderer','icon.png'), title: 'm3u8 Studio', backgroundColor: '#f5f6fa', autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  window.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.on('close', event => {
    if (!quitting) {
      event.preventDefault();
      // Linux desktops can lack a tray host; keep an accessible taskbar window.
      if (process.platform === 'linux' || (!tray && process.platform !== 'darwin')) window.minimize();
      else window.hide();
    }
  });
}

function registerIPC() {
  const methods = {
    snapshot: () => service.snapshot(),
    'add-downloads': input => service.addDownloads(input),
    'add-schedule': input => service.addSchedule(input),
    'save-settings': input => service.saveSettings(input),
    probe: () => service.probe(),
    'probe-settings': input => service.probe({ enginePath: String(input.enginePath || ''), ffmpegPath: String(input.ffmpegPath || '') }, false),
    stop: id => service.stop(id), retry: id => service.retry(id), remove: id => service.remove(id),
    'choose-directory': async () => {
      const result = await dialog.showOpenDialog(window, { properties: ['openDirectory', 'createDirectory'] });
      return result.canceled ? null : result.filePaths[0];
    },
    'choose-executable': async () => {
      const result = await dialog.showOpenDialog(window, { properties: ['openFile'], ...(process.platform === 'win32' ? { filters: [{ name: '可执行文件', extensions: ['exe'] }] } : {}) });
      if (result.canceled) return null;
      validateExecutable(result.filePaths[0]);
      return result.filePaths[0];
    },
    'open-output': async id => {
      const job = service.jobs.find(j => j.id === id);
      if (!job) throw new Error('任务不存在。');
      const error = await shell.openPath(job.outputDir); if (error) throw new Error(error);
    },
    'open-default-output': async () => {
      fs.mkdirSync(service.settings.downloadDir, { recursive: true });
      const error = await shell.openPath(service.settings.downloadDir); if (error) throw new Error(error);
    },
    'open-official': () => shell.openExternal('https://github.com/nilaoda/N_m3u8DL-RE'),
  };
  for (const [name, fn] of Object.entries(methods)) ipcMain.handle(name, async (event, input) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('不允许的请求来源。');
    try { return { ok: true, value: await fn(input) }; } catch(error) { return { ok: false, error: error.message }; }
  });
}

if (locked) app.whenReady().then(async () => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit', label: '退出应用' }] }] : []),
    { label: '文件', submenu: [{ label: '打开主窗口', click: showWindow }, { type: 'separator' }, { label: '退出应用', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }] },
    { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: '窗口', submenu: [{ role: 'minimize' }, { role: 'togglefullscreen' }, { label: '打开主窗口', click: showWindow }] },
  ]));
  service = new DownloadService({ dataDir: app.getPath('userData'), downloadDir: path.join(app.getPath('downloads'), 'm3u8 Studio'), toolsDir: app.isPackaged ? path.join(process.resourcesPath,'tools') : path.join(__dirname,'..','.build','bundled',`${process.platform}-${process.arch}`,'tools'), runnerPath: app.isPackaged ? path.join(process.resourcesPath, 'runner.exe') : path.join(__dirname, '..', 'native', 'runner.exe') });
  registerIPC(); createWindow();
  try {
    const icon = nativeImage.createFromPath(path.join(__dirname, 'renderer', process.platform === 'darwin' ? 'trayTemplate.png' : 'icon.png'));
    if (process.platform === 'darwin') icon.setTemplateImage(true);
    tray = new Tray(process.platform === 'darwin' ? icon : icon.resize({ width: 24, height: 24 }));
    tray.setToolTip('m3u8 Studio · 后台下载与定时录制');
    tray.setContextMenu(Menu.buildFromTemplate([{ label: '打开 m3u8 Studio', click: showWindow }, { type: 'separator' }, { label: '退出应用', click: () => app.quit() }]));
    tray.on('click', showWindow);
    tray.on('double-click', showWindow);
  } catch (error) {
    // Background work remains accessible through Dock / taskbar and app menu.
    service.startupWarning = `系统托盘不可用：${error.message}。可从 Dock 或任务栏打开窗口。`;
  }
  service.on('change', () => {
    if (!broadcasting) broadcasting = setTimeout(() => { broadcasting = null; if (!window.isDestroyed()) window.webContents.send('state', service.snapshot()); }, 180);
  });
  service.on('warning', message => { if (!window.isDestroyed()) window.webContents.send('warning', message); });
  await service.ready();
});

app.on('before-quit', event => {
  if (!quitting && service) {
    event.preventDefault(); quitting = true;
    service.shutdown().then(() => { tray?.destroy(); app.quit(); }).catch(error => { dialog.showErrorBox('保存任务失败', error.message); app.exit(1); });
  }
});
app.on('activate', showWindow);
