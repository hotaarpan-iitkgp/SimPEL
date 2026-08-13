const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow = null;
let cppSolverProcess = null;
let activeServerPort = 3000;

async function startEmbeddedServer() {
    try {
        const serverPath = path.join(__dirname, '../dist/server.cjs');
        console.log('[Electron] Starting embedded server from:', serverPath);
        const serverModule = require(serverPath);
        if (typeof serverModule.startServer === 'function') {
            activeServerPort = await serverModule.startServer(process.env.PORT ? parseInt(process.env.PORT, 10) : 3000);
            console.log(`[Electron] Embedded server actively bound to port ${activeServerPort}`);
        } else {
            console.warn('[Electron] startServer function missing from server.cjs module');
        }
    } catch (err) {
        console.error('[Electron] Failed to start embedded server:', err);
    }
}

function startCppSolverIfAvailable() {
    try {
        const exePath = path.join(__dirname, '../C++ Solver/build/circuitsim_solver.exe');
        const fs = require('fs');
        if (fs.existsSync(exePath)) {
            console.log('[Electron] Found native C++ solver executable, spawning on port 3001...');
            cppSolverProcess = spawn(exePath, [], {
                cwd: path.dirname(exePath),
                stdio: 'ignore'
            });
            cppSolverProcess.on('error', (err) => {
                console.warn('[Electron] C++ solver launch error (falling back to TS solver):', err.message);
            });
        }
    } catch (e) {
        console.warn('[Electron] C++ solver check skipped:', e.message);
    }
}

async function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1366,
        height: 868,
        minWidth: 1024,
        minHeight: 700,
        title: 'simPEL - Standalone Circuit Simulator Pro',
        icon: path.join(__dirname, '../public/favicon.ico'),
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: false
        }
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http:') || url.startsWith('https:')) {
            shell.openExternal(url);
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });

    const serverUrl = `http://127.0.0.1:${activeServerPort}`;
    console.log(`[Electron] Loading main window from: ${serverUrl}`);
    
    try {
        await mainWindow.loadURL(serverUrl);
    } catch (err) {
        console.error('[Electron] Main window loadURL error:', err);
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    app.whenReady().then(async () => {
        await startEmbeddedServer();
        startCppSolverIfAvailable();
        await createWindow();

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });
    });
}

function cleanupProcesses() {
    if (cppSolverProcess) {
        console.log('[Electron] Terminating C++ solver process...');
        cppSolverProcess.kill();
        cppSolverProcess = null;
    }
}

app.on('window-all-closed', () => {
    cleanupProcesses();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('will-quit', () => {
    cleanupProcesses();
});
