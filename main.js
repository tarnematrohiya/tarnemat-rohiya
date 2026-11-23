// Brethren Presenter — Electron main process
const { app, BrowserWindow, protocol, net, ipcMain, screen, session, Menu, utilityProcess } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');

protocol.registerSchemesAsPrivileged([{ scheme: 'bp', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

// edition: lite = church version without the microphone (Windows + 2nd Mac app). edition.json is written by the build.
const EDITION = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'edition.json'), 'utf8')); } catch (e) { return {}; } })();
const LITE = !!EDITION.lite;
if (LITE) app.setPath('userData', path.join(app.getPath('appData'), 'Tarnemat Rohiya'));
ipcMain.on('edition', e => { e.returnValue = { lite: LITE }; });
const RENDERER = path.join(__dirname, 'renderer');
const MODELS = app.isPackaged ? path.join(process.resourcesPath, 'models') : path.join(__dirname, 'models');
let control = null, output = null, lastSlide = null, lastStyle = null;
// debug log next to the app (…/dist/logs/speech-YYYY-MM-DD.log) so problems can be read later
let LOGDIR = null;
function logLine(msg) {
  try {
    if (!LOGDIR) { const base = !app.isPackaged ? __dirname : process.platform === 'darwin' ? path.resolve(path.dirname(app.getPath('exe')), '../../..') : app.getPath('userData'); LOGDIR = path.join(base, 'logs'); fs.mkdirSync(LOGDIR, { recursive: true }); }
    const d = new Date(), day = d.toISOString().slice(0, 10);
    fs.appendFileSync(path.join(LOGDIR, 'speech-' + day + '.log'), d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0') + ' ' + msg + '\n');
  } catch (e) {}
}

// Windows 7/8 build runs on Electron 22 (no protocol.handle)
const LEGACY = parseInt(process.versions.electron, 10) < 25;
function resolveFile(u) {
  const root = u.host === 'models' ? MODELS : RENDERER;
  const file = path.normalize(path.join(root, decodeURIComponent(u.pathname)));
  return file.startsWith(root) ? file : null;
}
function serveLegacy() {
  const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };
  protocol.registerFileProtocol('bp', (req, cb) => {
    const file = resolveFile(new URL(req.url));
    if (!file || !fs.existsSync(file)) return cb({ error: -6 });
    cb({ path: file, mimeType: MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cross-Origin-Resource-Policy': 'same-origin' } });
  });
}
function serve() {
  if (LEGACY || !protocol.handle) return serveLegacy();
  protocol.handle('bp', async req => {
    const u = new URL(req.url);
    const file = resolveFile(u);
    if (!file || !fs.existsSync(file)) return new Response('not found', { status: 404 });
    const r = await net.fetch(pathToFileURL(file).toString());
    const h = new Headers(r.headers);
    h.set('Content-Length', String(fs.statSync(file).size));
    h.set('Cross-Origin-Opener-Policy', 'same-origin');
    h.set('Cross-Origin-Embedder-Policy', 'require-corp');
    h.set('Cross-Origin-Resource-Policy', 'same-origin');
    if (file.endsWith('.mjs') || file.endsWith('.js')) h.set('Content-Type', 'text/javascript');
    if (file.endsWith('.wasm')) h.set('Content-Type', 'application/wasm');
    return new Response(r.body, { status: 200, headers: h });
  });
}

const prefs = { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false };

function createControl() {
  control = new BrowserWindow({
    width: 1480, height: 900, minWidth: 1180, minHeight: 720, show: false,
    title: 'ترنيمات روحية', backgroundColor: '#16171a',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: prefs
  });
  control.loadURL('bp://renderer/index.html');
  control.once('ready-to-show', () => { control.maximize(); control.show(); openOutput(false); });
  control.webContents.on('did-finish-load', () => setTimeout(sendStatus, 400));   // the button shows the projector state from the start
  control.on('closed', () => { control = null; if (output && !output.isDestroyed()) output.destroy(); app.quit(); });
}

function externalDisplay() {
  const primary = screen.getPrimaryDisplay();
  return screen.getAllDisplays().find(d => d.id !== primary.id) || null;
}

function openOutput(userAsked) {
  const ext = externalDisplay();
  if (!ext && !userAsked) { sendStatus(); return; }   // no projector yet: wait for it
  if (output && !output.isDestroyed()) { placeOutput(); output.show(); return; }
  output = new BrowserWindow({
    width: 1280, height: 720, show: false, frame: !ext, backgroundColor: '#000000',
    title: 'شاشة العرض', autoHideMenuBar: true, webPreferences: prefs
  });
  output.loadURL('bp://renderer/output.html');
  output.once('ready-to-show', () => { placeOutput(); output.show(); if (control) control.focus(); });
  output.webContents.on('did-finish-load', () => { if (lastStyle) output.webContents.send('style', lastStyle); output.webContents.send('slide', lastSlide); });
  output.on('closed', () => { output = null; sendStatus(); });
  sendStatus();
}

function placeOutput() {
  if (!output || output.isDestroyed()) return;
  const ext = externalDisplay();
  if (ext) {
    output.setBounds(ext.bounds);
    output.setFullScreen(true);
  } else {
    output.setFullScreen(false);
  }
  sendStatus();
}

function sendStatus() {
  if (!control || control.isDestroyed()) return;
  control.webContents.send('status', {
    outputOpen: !!(output && !output.isDestroyed()),
    projector: !!externalDisplay(),
    displays: screen.getAllDisplays().length
  });
}

// ---------- automatic updates (Windows): new versions come from GitHub Releases ----------
function startUpdates() {
  if (!app.isPackaged || process.platform !== 'win32') return;
  let autoUpdater;
  try { ({ autoUpdater } = require('electron-updater')); } catch (e) { logLine('UPDATE no updater ' + e.message); return; }
  if (LEGACY) { autoUpdater.channel = 'win7'; autoUpdater.allowDowngrade = false; }   // Windows 7/8 copies only take Windows 7/8 updates (win7.yml)
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;            // the new version is installed when the app is closed
  const tell = m => { if (control && !control.isDestroyed()) control.webContents.send('update', m); };
  autoUpdater.on('update-available', i => { logLine('UPDATE available ' + i.version); tell({ state: 'downloading', version: i.version }); });
  autoUpdater.on('update-downloaded', i => { logLine('UPDATE ready ' + i.version); tell({ state: 'ready', version: i.version }); });
  autoUpdater.on('error', e => logLine('UPDATE error ' + (e && e.message)));
  const check = () => autoUpdater.checkForUpdates().catch(e => logLine('UPDATE check failed ' + e.message));   // no internet = just try later
  setTimeout(check, 8000);
  setInterval(check, 6 * 60 * 60 * 1000);
}
ipcMain.handle('app-version', () => app.getVersion());
ipcMain.on('update-now', () => { try { require('electron-updater').autoUpdater.quitAndInstall(true, true); } catch (e) {} });

app.whenReady().then(() => {
  serve();
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(perm === 'media' || perm === 'fullscreen'));
  session.defaultSession.setPermissionCheckHandler((wc, perm) => perm === 'media' || perm === 'fullscreen');
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'ترنيمات روحية', submenu: [{ role: 'about', label: 'عن البرنامج' }, { type: 'separator' }, { role: 'hide', label: 'إخفاء' }, { role: 'quit', label: 'خروج' }] },
      { label: 'تعديل', submenu: [{ role: 'undo', label: 'تراجع' }, { role: 'cut', label: 'قص' }, { role: 'copy', label: 'نسخ' }, { role: 'paste', label: 'لصق' }, { role: 'selectAll', label: 'تحديد الكل' }] },
      { label: 'نافذة', submenu: [{ role: 'minimize', label: 'تصغير' }, { role: 'togglefullscreen', label: 'ملء الشاشة' }] }
    ]));
  } else Menu.setApplicationMenu(null);
  createControl();
  startUpdates();
  screen.on('display-added', () => { if (output && !output.isDestroyed()) placeOutput(); else openOutput(false); });
  screen.on('display-removed', () => { placeOutput(); });
  screen.on('display-metrics-changed', () => placeOutput());
});
app.on('window-all-closed', () => app.quit());

ipcMain.on('slide', (e, s) => { lastSlide = s; if (output && !output.isDestroyed()) output.webContents.send('slide', s); });
ipcMain.on('style', (e, s) => { lastStyle = s; if (output && !output.isDestroyed()) output.webContents.send('style', s); });
ipcMain.on('open-output', () => openOutput(true));
ipcMain.on('output-fullscreen', () => { if (output && !output.isDestroyed()) output.setFullScreen(!output.isFullScreen()); });
ipcMain.on('key', (e, k) => { if (control && !control.isDestroyed()) control.webContents.send('key', k); });
ipcMain.handle('status', () => ({ outputOpen: !!(output && !output.isDestroyed()), projector: !!externalDisplay() }));

// ---------- real-time offline speech recognition (Vosk, utility process) ----------
const VOSK_DIR = app.isPackaged ? path.join(process.resourcesPath, 'vosk') : path.join(__dirname, 'vosk');
const VOSK_LIB = process.platform === 'darwin' ? 'libvosk.dyld' : process.platform === 'win32' ? 'libvosk.dll' : 'libvosk.so';
let ear = null;
function earStart() {
  if (ear) return;
  const toUI = m => { if (control && !control.isDestroyed()) control.webContents.send('asr', m); };
  const proc = utilityProcess.fork(path.join(__dirname, 'asr', 'ear-proc.js'), [path.join(VOSK_DIR, VOSK_LIB), path.join(MODELS, 'vosk-ar')], { serviceName: 'Brethren Presenter Speech' });
  ear = proc;
  proc.on('message', m => { if (m.type !== 'loading') logLine('VOSK ' + m.type + ' ' + (m.text || m.msg || m.device || '') + (m.ms != null ? ' (' + m.ms + 'ms)' : '')); toUI(m); });
  proc.on('exit', code => { logLine('VOSK exit ' + code); if (ear === proc) { ear = null; toUI({ type: 'error', msg: 'speech process stopped (' + code + ')', fatal: true }); } });
  proc.postMessage({ type: 'load' });
}
ipcMain.on('asr-load', () => { if (LITE) return; earStart(); whisperStart(); });
ipcMain.on('asr-audio', (e, m) => { if (ear) ear.postMessage({ type: 'audio', audio: Int16Array.from(m.audio) }); });
ipcMain.on('asr-reset', () => { if (ear) ear.postMessage({ type: 'reset' }); });
app.on('before-quit', () => { if (ear) ear.kill(); if (whisper) whisper.kill(); });

// ---------- exact transcription for finished sentences (Whisper, second utility process) ----------
let whisper = null, wDevices = null, wRestarts = 0;
function whisperStart() {
  if (whisper) return;
  if (!wDevices) wDevices = process.platform === 'win32' ? ['dml', 'cpu'] : ['cpu']   // Mac: ORT WebGPU can't run this merged decoder (log 2026-11-16), CPU is fine;
  const dev = wDevices[0];
  const toUI = m => { if (control && !control.isDestroyed()) control.webContents.send('asr', m); };
  const proc = utilityProcess.fork(path.join(__dirname, 'asr', 'asr-proc.js'), [MODELS, path.join(RENDERER, 'check.f32'), dev], { serviceName: 'Brethren Presenter Whisper' });
  whisper = proc;
  proc.on('message', m => {
    if (m.type !== 'wloading') logLine('WHISPER ' + m.type + ' ' + (m.text != null ? m.text : (m.msg || m.device || '')) + (m.ms != null ? ' (' + m.ms + 'ms)' : ''));
    if (m.type === 'werror' && m.fatal && wDevices.length > 1) { toUI({ type: 'log', msg: dev + ' failed, retry on cpu: ' + m.msg }); wDevices = wDevices.slice(1); whisper = null; proc.kill(); whisperStart(); return; }
    toUI(m);
  });
  proc.on('exit', code => { logLine('WHISPER exit ' + code); if (whisper === proc) { whisper = null; wRestarts = (wRestarts || 0) + 1; if (wRestarts <= 3) setTimeout(whisperStart, 1000); } });
  proc.postMessage({ type: 'load' });
}
ipcMain.on('log', (e, m) => logLine('APP ' + m));
// meetings history (اجتماع اليوم / السجل) -> userData/meetings.json
const MEET_FILE = () => path.join(app.getPath('userData'), 'meetings.json');
ipcMain.handle('meet-load', () => { try { return JSON.parse(fs.readFileSync(MEET_FILE(), 'utf8')); } catch (e) { return null; } });
ipcMain.on('meet-save', (e, data) => { try { const f = MEET_FILE(); fs.writeFileSync(f + '.tmp', JSON.stringify(data)); fs.renameSync(f + '.tmp', f); } catch (err) { logLine('meet-save failed ' + err.message); } });
ipcMain.on('whisper-audio', (e, m) => {
  logLine('APP -> whisper clip ' + (m.audio.length / 16000).toFixed(1) + 's id ' + m.id + (whisper ? '' : ' (WHISPER NOT RUNNING)')); if (whisper) whisper.postMessage({ type: 'audio', audio: Float32Array.from(m.audio), id: m.id, kind: 'full' }); });   // fresh copy: a typed-array view with an offset crashed the utility process
