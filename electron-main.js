const { app, BrowserWindow, protocol } = require('electron');
const path = require('path');
const url = require('url');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Enterprise ERP System",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'electron-preload.js')
    },
    autoHideMenuBar: true
  });

  // Load the built dist index.html
  const indexPath = path.join(__dirname, 'dist', 'index.html');
  mainWindow.loadURL(
    url.format({
      pathname: indexPath,
      protocol: 'file:',
      slashes: true
    })
  );

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Register custom protocol or handle file protocol caching
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
