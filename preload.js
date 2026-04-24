const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vct', {
  // Environment
  checkClaude: () => ipcRenderer.invoke('env:checkClaude'),
  checkGit: () => ipcRenderer.invoke('env:checkGit'),

  // Projects
  listProjects: () => ipcRenderer.invoke('project:list'),
  createProject: (project) => ipcRenderer.invoke('project:create', project),
  updateProject: (id, updates) => ipcRenderer.invoke('project:update', id, updates),
  deleteProject: (id) => ipcRenderer.invoke('project:delete', id),
  getProject: (id) => ipcRenderer.invoke('project:get', id),
  chooseProjectDirectory: () => ipcRenderer.invoke('project:chooseWorkDir'),

  // Tasks
  listTasks: (projectId) => ipcRenderer.invoke('task:list', projectId),
  createTask: (projectId, task) => ipcRenderer.invoke('task:create', projectId, task),
  updateTask: (projectId, taskId, updates) => ipcRenderer.invoke('task:update', projectId, taskId, updates),
  deleteTask: (projectId, taskId) => ipcRenderer.invoke('task:delete', projectId, taskId),
  reorderTasks: (projectId, taskOrders) => ipcRenderer.invoke('task:reorder', projectId, taskOrders),
  moveTaskToFirst: (projectId, taskId) => ipcRenderer.invoke('task:moveToFirst', projectId, taskId),

  // Engine
  startProject: (projectId) => ipcRenderer.invoke('engine:start', projectId),
  pauseProject: (projectId) => ipcRenderer.invoke('engine:pause', projectId),
  getEngineStatus: (projectId) => ipcRenderer.invoke('engine:status', projectId),
  getProgress: (projectId) => ipcRenderer.invoke('engine:progress', projectId),
  getTerminalHistory: (projectId) => ipcRenderer.invoke('engine:terminalHistory', projectId),
  clearTerminalHistory: (projectId) => ipcRenderer.invoke('engine:clearTerminalHistory', projectId),
  recoverProject: (projectId) => ipcRenderer.invoke('engine:recoverProject', projectId),

  // Terminal output events
  onTerminalData: (callback) => {
    ipcRenderer.on('terminal:data', (_, data) => callback(data));
  },
  onTerminalClear: (callback) => {
    ipcRenderer.on('terminal:clear', (_, data) => callback(data));
  },
  onEngineStatusChange: (callback) => {
    ipcRenderer.on('engine:status-change', (_, data) => callback(data));
  },
  onTaskStatusChange: (callback) => {
    ipcRenderer.on('task:status-change', (_, data) => callback(data));
  },

  // Remove listeners
  removeTerminalDataListener: () => ipcRenderer.removeAllListeners('terminal:data'),
  removeTerminalClearListener: () => ipcRenderer.removeAllListeners('terminal:clear'),
  removeEngineStatusListener: () => ipcRenderer.removeAllListeners('engine:status-change'),
  removeTaskStatusListener: () => ipcRenderer.removeAllListeners('task:status-change'),
});
