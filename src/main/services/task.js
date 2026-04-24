const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getProject } = require('./project');

const TASK_BOARD_STATUSES = ['todo', 'in_progress', 'blocked', 'suspended', 'done'];
const TASK_EXECUTION_STATUSES = ['idle', 'queued', 'analyzing', 'planning', 'developing', 'reviewing', 'testing', 'fixing', 'committing', 'completed', 'failed'];

function getTasksFilePath(projectId) {
  const project = getProject(projectId);
  if (!project) return null;
  return path.join(project.workDir, '.vct', 'tasks.json');
}

function readTasks(projectId) {
  const filePath = getTasksFilePath(projectId);
  if (!filePath || !fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeTasks(projectId, tasks) {
  const filePath = getTasksFilePath(projectId);
  if (!filePath) throw new Error('Project not found');
  fs.writeFileSync(filePath, JSON.stringify(tasks, null, 2), 'utf-8');
}

function normalizeTask(task, index) {
  const now = new Date().toISOString();
  return {
    id: task.id,
    title: task.title,
    description: task.description || '',
    priority: task.priority || 'medium',
    order: typeof task.order === 'number' ? task.order : index + 1,
    boardStatus: task.boardStatus || (task.status === 'completed' ? 'done' : 'todo'),
    executionStatus: task.executionStatus || mapLegacyExecutionStatus(task.status),
    sessionId: task.sessionId || '',
    analysis: task.analysis || '',
    plan: task.plan || '',
    reviewResult: task.reviewResult || '',
    testResult: task.testResult || '',
    commitHash: task.commitHash || '',
    lastError: task.lastError || '',
    history: Array.isArray(task.history) ? task.history : [],
    createdAt: task.createdAt || now,
    updatedAt: task.updatedAt || now,
    completedAt: task.completedAt || null,
  };
}

function mapLegacyExecutionStatus(status) {
  const legacyMap = {
    pending: 'idle',
    analyzing: 'analyzing',
    planned: 'planning',
    developing: 'developing',
    reviewing: 'reviewing',
    testing: 'testing',
    fixing: 'fixing',
    committing: 'committing',
    completed: 'completed',
  };
  return legacyMap[status] || 'idle';
}

function listTasks(projectId) {
  return readTasks(projectId)
    .map(normalizeTask)
    .sort((a, b) => a.order - b.order);
}

function createTask(projectId, task) {
  const tasks = listTasks(projectId);
  const now = new Date().toISOString();
  const maxOrder = tasks.reduce((max, t) => Math.max(max, t.order || 0), 0);
  const newTask = {
    id: uuidv4(),
    title: task.title,
    description: task.description || '',
    priority: task.priority || 'medium',
    boardStatus: task.boardStatus || 'todo',
    executionStatus: 'idle',
    sessionId: '',
    order: maxOrder + 1,
    analysis: '',
    plan: '',
    reviewResult: '',
    testResult: '',
    commitHash: '',
    lastError: '',
    history: [
      {
        id: uuidv4(),
        type: 'task_created',
        title: '需求已创建',
        content: task.description || '等待开始执行',
        createdAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
  tasks.push(newTask);
  writeTasks(projectId, tasks);
  return newTask;
}

function updateTask(projectId, taskId, updates) {
  const tasks = listTasks(projectId);
  const index = tasks.findIndex(t => t.id === taskId);
  if (index === -1) return null;
  const updated = { ...tasks[index], ...updates, updatedAt: new Date().toISOString() };
  if ((updates.boardStatus === 'done' || updates.executionStatus === 'completed') && !tasks[index].completedAt) {
    updated.completedAt = new Date().toISOString();
  }
  if (updates.boardStatus && updates.boardStatus !== 'done') {
    updated.completedAt = null;
    if (!updates.executionStatus && ['completed', 'failed'].includes(tasks[index].executionStatus)) {
      updated.executionStatus = 'idle';
    }
  }
  tasks[index] = updated;
  writeTasks(projectId, tasks);
  return updated;
}

function deleteTask(projectId, taskId) {
  const tasks = readTasks(projectId);
  const task = tasks.find(t => t.id === taskId);
  const filtered = tasks.filter(t => t.id !== taskId);
  writeTasks(projectId, filtered);
  return task;
}

function moveTaskToFirst(projectId, taskId) {
  const tasks = readTasks(projectId);
  const index = tasks.findIndex(t => t.id === taskId);
  if (index === -1) return null;
  const [task] = tasks.splice(index, 1);
  tasks.unshift(task);
  tasks.forEach((t, i) => { t.order = i + 1; });
  writeTasks(projectId, tasks);
  return listTasks(projectId);
}

function reorderTasks(projectId, taskOrders) {
  // taskOrders: [{ id, order }]
  const tasks = readTasks(projectId);
  for (const item of taskOrders) {
    const task = tasks.find(t => t.id === item.id);
    if (task) task.order = item.order;
  }
  writeTasks(projectId, tasks);
  return listTasks(projectId);
}

function appendTaskHistory(projectId, taskId, entry) {
  const tasks = listTasks(projectId);
  const index = tasks.findIndex((task) => task.id === taskId);
  if (index === -1) return null;

  const nextHistory = [
    {
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      ...entry,
    },
    ...(tasks[index].history || []),
  ].slice(0, 100);

  tasks[index] = {
    ...tasks[index],
    history: nextHistory,
    updatedAt: new Date().toISOString(),
  };
  writeTasks(projectId, tasks);
  return tasks[index];
}

function getTask(projectId, taskId) {
  return listTasks(projectId).find((task) => task.id === taskId) || null;
}

module.exports = {
  listTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  reorderTasks,
  moveTaskToFirst,
  appendTaskHistory,
  TASK_BOARD_STATUSES,
  TASK_EXECUTION_STATUSES,
};
