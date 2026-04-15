const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');

const SERVER_PORT = 4892;
const isDev = process.env.NODE_ENV === 'development';

let mainWindow = null;
let pythonProcess = null;
let serverReady = false;

// ─── Config ──────────────────────────────────────────────────────────────────

const userDataPath = app.getPath('userData');
const narrAItorDataDir = path.join(userDataPath, 'narrAItor');
const configPath = path.join(userDataPath, 'config.json');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return {};
  }
}

function writeConfig(updates) {
  const config = readConfig();
  const next = { ...config, ...updates };
  fs.writeFileSync(configPath, JSON.stringify(next, null, 2));
  return next;
}

// ─── Python Server ────────────────────────────────────────────────────────────

function waitForServer(timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tryPing = () => {
      if (Date.now() > deadline) {
        return reject(new Error('Server did not start within timeout'));
      }
      http.get(`http://localhost:${SERVER_PORT}/api/ping`, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          setTimeout(tryPing, 500);
        }
        res.resume();
      }).on('error', () => setTimeout(tryPing, 500));
    };
    setTimeout(tryPing, 1500);
  });
}

async function startPythonServer(pythonPath) {
  if (pythonProcess) {
    try { pythonProcess.kill(); } catch {}
    pythonProcess = null;
    serverReady = false;
  }

  ensureDir(narrAItorDataDir);
  const serverScript = path.join(__dirname, '..', 'python', 'server.py');

  mainWindow?.webContents.send('python-status', { status: 'starting' });

  const spawnOpts = {
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  };

  // On Windows, we may need shell:true for conda environments
  pythonProcess = spawn(pythonPath, [
    serverScript,
    '--data-dir', narrAItorDataDir,
    '--port', String(SERVER_PORT),
  ], spawnOpts);

  let startupLog = '';

  pythonProcess.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    startupLog += text;
    mainWindow?.webContents.send('python-log', text);
  });

  pythonProcess.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    startupLog += text;
    mainWindow?.webContents.send('python-log', text);
  });

  pythonProcess.on('exit', (code, signal) => {
    serverReady = false;
    mainWindow?.webContents.send('python-status', {
      status: 'stopped',
      code,
      signal,
    });
  });

  try {
    await waitForServer();
    serverReady = true;
    mainWindow?.webContents.send('python-status', { status: 'ready' });
  } catch (err) {
    mainWindow?.webContents.send('python-status', {
      status: 'error',
      error: err.message,
      log: startupLog,
    });
  }
}

// ─── Window ───────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 760,
    backgroundColor: '#f9f9f7',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));

  // Send fullscreen state changes to renderer
  mainWindow.on('enter-full-screen', () => {
    console.log('[Main] Window entered fullscreen');
    mainWindow.webContents.send('window-fullscreen-changed', { isFullscreen: true });
  });
  mainWindow.on('leave-full-screen', () => {
    console.log('[Main] Window left fullscreen');
    mainWindow.webContents.send('window-fullscreen-changed', { isFullscreen: false });
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools();
  });

  // Push the current Python status to the renderer as soon as its DOM is ready
  // (i.e. right after DOMContentLoaded, when the onPythonStatus listener is set up).
  // This ensures we never miss events that fired while the page was still loading.
  mainWindow.webContents.on('dom-ready', () => {
    const status = serverReady ? 'ready' : (pythonProcess ? 'starting' : 'connecting');
    mainWindow.webContents.send('python-status', { status });
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('config-get', (_, key) => {
  const cfg = readConfig();
  return key ? cfg[key] : cfg;
});

ipcMain.handle('config-set', (_, key, value) => {
  return writeConfig({ [key]: value });
});

ipcMain.handle('get-data-dir', () => narrAItorDataDir);
ipcMain.handle('get-server-port', () => SERVER_PORT);
ipcMain.handle('get-server-ready', () => serverReady);
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('get-window-fullscreen', () => mainWindow?.isFullScreen() ?? false);

ipcMain.handle('open-file-dialog', async (_, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result;
});

ipcMain.handle('save-file-dialog', async (_, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options);
  return result;
});

ipcMain.handle('open-external', (_, url) => shell.openExternal(url));
ipcMain.handle('show-item-in-folder', (_, filePath) => shell.showItemInFolder(filePath));

ipcMain.handle('restart-python', async (_, pythonPath) => {
  const cfg = readConfig();
  const execPath = pythonPath || cfg.pythonPath || 'python';
  if (pythonPath) writeConfig({ pythonPath });
  await startPythonServer(execPath);
  return { ok: true };
});

ipcMain.handle('test-python', async (_, pythonPath) => {
  return new Promise((resolve) => {
    const proc = spawn(pythonPath, ['--version'], { stdio: 'pipe' });
    let out = '';
    proc.stdout.on('data', d => out += d.toString());
    proc.stderr.on('data', d => out += d.toString());
    proc.on('exit', (code) => resolve({ ok: code === 0, output: out.trim() }));
    proc.on('error', (err) => resolve({ ok: false, output: err.message }));
    setTimeout(() => { try { proc.kill(); } catch {} resolve({ ok: false, output: 'Timeout' }); }, 5000);
  });
});

// ─── App Lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  ensureDir(narrAItorDataDir);
  createWindow();

  const cfg = readConfig();
  let pythonPath = cfg.pythonPath;
  if (!pythonPath) {
    const venvPath = path.join(__dirname, '..', '.venv', 'bin', 'python');
    if (fs.existsSync(venvPath)) {
      pythonPath = venvPath;
    } else {
      // Windows fallback if venv is created differently
      const venvWinPath = path.join(__dirname, '..', '.venv', 'Scripts', 'python.exe');
      pythonPath = fs.existsSync(venvWinPath) ? venvWinPath : 'python';
    }
  }
  // Start server in background — window will show startup status
  startPythonServer(pythonPath).catch(() => {});
});

app.on('window-all-closed', () => {
  if (pythonProcess) {
    try { pythonProcess.kill(); } catch {}
  }
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!mainWindow) createWindow();
});

app.on('before-quit', () => {
  if (pythonProcess) {
    try { pythonProcess.kill(); } catch {}
  }
});
