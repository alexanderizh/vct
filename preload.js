const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vct', {
  // Environment
  checkClaude: () => ipcRenderer.invoke('env:checkClaude'),
  checkGit: () => ipcRenderer.invoke('env:checkGit'),
  checkAllCLIs: () => ipcRenderer.invoke('env:checkAllCLIs'),
  getSupportedAgents: () => ipcRenderer.invoke('env:getSupportedAgents'),

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

  // Agents
  listAgents: () => ipcRenderer.invoke('agent:list'),
  getAgent: (agentId) => ipcRenderer.invoke('agent:get', agentId),
  createAgent: (agent) => ipcRenderer.invoke('agent:create', agent),
  updateAgent: (agentId, updates) => ipcRenderer.invoke('agent:update', agentId, updates),
  deleteAgent: (agentId) => ipcRenderer.invoke('agent:delete', agentId),
  checkAgentAvailable: (agentId) => ipcRenderer.invoke('agent:checkAvailable', agentId),
  getAgentTasks: () => ipcRenderer.invoke('agent:getTasks'),

  // Bugs
  listBugs: (projectId) => ipcRenderer.invoke('bug:list', projectId),
  getBug: (projectId, bugId) => ipcRenderer.invoke('bug:get', projectId, bugId),
  createBug: (projectId, bug) => ipcRenderer.invoke('bug:create', projectId, bug),
  updateBug: (projectId, bugId, updates) => ipcRenderer.invoke('bug:update', projectId, bugId, updates),
  deleteBug: (projectId, bugId) => ipcRenderer.invoke('bug:delete', projectId, bugId),
  reorderBugs: (projectId, bugOrders) => ipcRenderer.invoke('bug:reorder', projectId, bugOrders),
  moveBugToFirst: (projectId, bugId) => ipcRenderer.invoke('bug:moveToFirst', projectId, bugId),

  // Bug Fix Engine
  fixSingleBug: (projectId, bugId) => ipcRenderer.invoke('bug:fixOne', projectId, bugId),
  fixAllBugs: (projectId) => ipcRenderer.invoke('bug:fixAll', projectId),
  pauseBugFix: (projectId) => ipcRenderer.invoke('bug:pauseFix', projectId),
  getBugFixStatus: (projectId) => ipcRenderer.invoke('bug:fixStatus', projectId),

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

  // Bug status events
  onBugStatusChange: (callback) => {
    ipcRenderer.on('bug:status-change', (_, data) => callback(data));
  },
  removeBugStatusListener: () => ipcRenderer.removeAllListeners('bug:status-change'),
});
