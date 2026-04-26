const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'VCT - Visual Claude Code Task Manager',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  // Flush all progress buffers before quitting
  try {
    require('./src/main/services/engine').forceFlushAllProgressBuffers();
  } catch (e) {}
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Flush buffers before quitting (macOS Cmd+Q)
app.on('before-quit', () => {
  try {
    require('./src/main/services/engine').forceFlushAllProgressBuffers();
  } catch (e) {}
  try {
    require('./src/main/services/interaction').cleanup();
  } catch (e) {}
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ===================== IPC Handlers =====================

// --- Environment Detection ---
ipcMain.handle('env:checkClaude', async () => {
  return require('./src/main/services/env-check').checkClaude();
});

ipcMain.handle('env:checkGit', async () => {
  return require('./src/main/services/env-check').checkGit();
});

ipcMain.handle('env:checkAllCLIs', async () => {
  return require('./src/main/services/env-check').checkAllCLIs();
});

ipcMain.handle('env:getSupportedAgents', async () => {
  return require('./src/main/services/env-check').getSupportedAgents();
});

// --- Project Management ---
ipcMain.handle('project:list', async () => {
  return require('./src/main/services/project').listProjects();
});

ipcMain.handle('project:create', async (_, project) => {
  return require('./src/main/services/project').createProject(project);
});

ipcMain.handle('project:update', async (_, id, updates) => {
  return require('./src/main/services/project').updateProject(id, updates);
});

ipcMain.handle('project:delete', async (_, id) => {
  return require('./src/main/services/project').deleteProject(id);
});

ipcMain.handle('project:get', async (_, id) => {
  return require('./src/main/services/project').getProject(id);
});

ipcMain.handle('project:chooseWorkDir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled) {
    return null;
  }
  return result.filePaths[0] || null;
});

// --- Task Management ---
ipcMain.handle('task:list', async (_, projectId) => {
  return require('./src/main/services/task').listTasks(projectId);
});

ipcMain.handle('task:create', async (_, projectId, task) => {
  return require('./src/main/services/task').createTask(projectId, task);
});

ipcMain.handle('task:update', async (_, projectId, taskId, updates) => {
  return require('./src/main/services/task').updateTask(projectId, taskId, updates);
});

ipcMain.handle('task:delete', async (_, projectId, taskId) => {
  return require('./src/main/services/task').deleteTask(projectId, taskId);
});

ipcMain.handle('task:reorder', async (_, projectId, taskOrders) => {
  return require('./src/main/services/task').reorderTasks(projectId, taskOrders);
});

ipcMain.handle('task:moveToFirst', async (_, projectId, taskId) => {
  return require('./src/main/services/task').moveTaskToFirst(projectId, taskId);
});

// --- Claude Code Engine ---
ipcMain.handle('engine:start', async (_, projectId) => {
  return require('./src/main/services/engine').startProject(projectId, mainWindow);
});

ipcMain.handle('engine:pause', async (_, projectId) => {
  return require('./src/main/services/engine').pauseProject(projectId);
});

ipcMain.handle('engine:status', async (_, projectId) => {
  return require('./src/main/services/engine').getEngineStatus(projectId);
});

ipcMain.handle('engine:progress', async (_, projectId) => {
  return require('./src/main/services/engine').getProgress(projectId);
});

ipcMain.handle('engine:terminalHistory', async (_, projectId) => {
  return require('./src/main/services/engine').getTerminalHistory(projectId);
});

ipcMain.handle('engine:clearTerminalHistory', async (_, projectId) => {
  return require('./src/main/services/engine').clearTerminalHistory(projectId);
});

ipcMain.handle('engine:recoverProject', async (_, projectId) => {
  return require('./src/main/services/engine').recoverProject(projectId);
});

// --- Agent Management ---
ipcMain.handle('agent:list', async () => {
  return require('./src/main/services/agent').listAgents();
});

ipcMain.handle('agent:get', async (_, agentId) => {
  return require('./src/main/services/agent').getAgent(agentId);
});

ipcMain.handle('agent:create', async (_, agent) => {
  return require('./src/main/services/agent').createAgent(agent);
});

ipcMain.handle('agent:update', async (_, agentId, updates) => {
  return require('./src/main/services/agent').updateAgent(agentId, updates);
});

ipcMain.handle('agent:delete', async (_, agentId) => {
  return require('./src/main/services/agent').deleteAgent(agentId);
});

ipcMain.handle('agent:checkAvailable', async (_, agentId) => {
  return require('./src/main/services/agent').checkAgentAvailable(agentId);
});

ipcMain.handle('agent:getTasks', async () => {
  return require('./src/main/services/agent').getAgentTasks();
});

// --- Bug Management ---
ipcMain.handle('bug:list', async (_, projectId) => {
  return require('./src/main/services/bug').listBugs(projectId);
});

ipcMain.handle('bug:get', async (_, projectId, bugId) => {
  return require('./src/main/services/bug').getBug(projectId, bugId);
});

ipcMain.handle('bug:create', async (_, projectId, bug) => {
  return require('./src/main/services/bug').createBug(projectId, bug);
});

ipcMain.handle('bug:update', async (_, projectId, bugId, updates) => {
  return require('./src/main/services/bug').updateBug(projectId, bugId, updates);
});

ipcMain.handle('bug:delete', async (_, projectId, bugId) => {
  return require('./src/main/services/bug').deleteBug(projectId, bugId);
});

ipcMain.handle('bug:reorder', async (_, projectId, bugOrders) => {
  return require('./src/main/services/bug').reorderBugs(projectId, bugOrders);
});

ipcMain.handle('bug:moveToFirst', async (_, projectId, bugId) => {
  return require('./src/main/services/bug').moveBugToFirst(projectId, bugId);
});

// --- Bug Fix Engine ---
ipcMain.handle('bug:fixOne', async (_, projectId, bugId) => {
  return require('./src/main/services/bug-engine').fixSingleBug(projectId, bugId, mainWindow);
});

ipcMain.handle('bug:fixAll', async (_, projectId) => {
  return require('./src/main/services/bug-engine').startBugFixLoop(projectId, mainWindow);
});

ipcMain.handle('bug:pauseFix', async (_, projectId) => {
  return require('./src/main/services/bug-engine').pauseBugFix(projectId);
});

ipcMain.handle('bug:fixStatus', async (_, projectId) => {
  return require('./src/main/services/bug-engine').getBugFixStatus(projectId);
});

// --- Interaction Management ---
ipcMain.handle('interaction:submit', async (_, projectId, taskId, interactionId, answer) => {
  return require('./src/main/services/interaction').submitAnswer(
    projectId,
    taskId,
    interactionId,
    answer,
    mainWindow
  );
});

ipcMain.handle('interaction:cancel', async (_, projectId, taskId, interactionId) => {
  return require('./src/main/services/interaction').cancelInteraction(
    projectId,
    taskId,
    interactionId,
    mainWindow
  );
});

ipcMain.handle('interaction:getPending', async (_, projectId, taskId) => {
  return require('./src/main/services/interaction').getPendingInteractions(projectId, taskId);
});
