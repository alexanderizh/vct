const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getProject } = require('./project');

const BUG_BOARD_STATUSES = ['todo', 'in_progress', 'blocked', 'suspended', 'done'];
const BUG_EXECUTION_STATUSES = ['idle', 'analyzing', 'fixing', 'verifying', 'completed', 'failed'];
const BUG_SEVERITY_LEVELS = ['low', 'medium', 'high', 'critical'];
const BUG_SOURCES = ['manual', 'code_review', 'testing', 'auto_detect'];

function getBugsFilePath(projectId) {
  const project = getProject(projectId);
  if (!project) return null;
  return path.join(project.workDir, '.vct', 'bugs.json');
}

function readBugs(projectId) {
  const filePath = getBugsFilePath(projectId);
  if (!filePath || !fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeBugs(projectId, bugs) {
  const filePath = getBugsFilePath(projectId);
  if (!filePath) throw new Error('Project not found');
  fs.writeFileSync(filePath, JSON.stringify(bugs, null, 2), 'utf-8');
}

function normalizeBug(bug, index) {
  const now = new Date().toISOString();
  return {
    id: bug.id,
    title: bug.title,
    description: bug.description || '',
    severity: bug.severity || 'medium',
    source: bug.source || 'manual',
    relatedTaskId: bug.relatedTaskId || null,
    filepaths: Array.isArray(bug.filepaths) ? bug.filepaths : [],
    stackTrace: bug.stackTrace || '',
    reproductionSteps: bug.reproductionSteps || '',
    order: typeof bug.order === 'number' ? bug.order : index + 1,
    boardStatus: bug.boardStatus || 'todo',
    executionStatus: bug.executionStatus || 'idle',
    agentId: bug.agentId || '',
    sessionId: bug.sessionId || '',
    analysis: bug.analysis || '',
    fixResult: bug.fixResult || '',
    lastError: bug.lastError || '',
    history: Array.isArray(bug.history) ? bug.history : [],
    createdAt: bug.createdAt || now,
    updatedAt: bug.updatedAt || now,
    completedAt: bug.completedAt || null,
  };
}

function listBugs(projectId) {
  return readBugs(projectId)
    .map(normalizeBug)
    .sort((a, b) => a.order - b.order);
}

function getBug(projectId, bugId) {
  return listBugs(projectId).find((bug) => bug.id === bugId) || null;
}

function createBug(projectId, bug) {
  const bugs = listBugs(projectId);
  const now = new Date().toISOString();
  const maxOrder = bugs.reduce((max, b) => Math.max(max, b.order || 0), 0);
  const newBug = {
    id: uuidv4(),
    title: bug.title,
    description: bug.description || '',
    severity: bug.severity || 'medium',
    source: bug.source || 'manual',
    relatedTaskId: bug.relatedTaskId || null,
    filepaths: Array.isArray(bug.filepaths) ? bug.filepaths : [],
    stackTrace: bug.stackTrace || '',
    reproductionSteps: bug.reproductionSteps || '',
    boardStatus: bug.boardStatus || 'todo',
    executionStatus: 'idle',
    agentId: bug.agentId || '',
    sessionId: '',
    order: maxOrder + 1,
    analysis: '',
    fixResult: '',
    lastError: '',
    history: [
      {
        id: uuidv4(),
        type: 'bug_created',
        title: 'Bug 已创建',
        content: bug.description || '等待处理',
        createdAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
  bugs.push(newBug);
  writeBugs(projectId, bugs);
  return newBug;
}

function updateBug(projectId, bugId, updates) {
  const bugs = listBugs(projectId);
  const index = bugs.findIndex((b) => b.id === bugId);
  if (index === -1) return null;
  const updated = { ...bugs[index], ...updates, updatedAt: new Date().toISOString() };
  if (updates.boardStatus === 'done' && !bugs[index].completedAt) {
    updated.completedAt = new Date().toISOString();
  }
  if (updates.boardStatus && updates.boardStatus !== 'done') {
    updated.completedAt = null;
    if (!updates.executionStatus && ['completed', 'failed'].includes(bugs[index].executionStatus)) {
      updated.executionStatus = 'idle';
    }
  }
  bugs[index] = updated;
  writeBugs(projectId, bugs);
  return updated;
}

function deleteBug(projectId, bugId) {
  const bugs = readBugs(projectId);
  const bug = bugs.find((b) => b.id === bugId);
  const filtered = bugs.filter((b) => b.id !== bugId);
  writeBugs(projectId, filtered);
  return bug;
}

function moveBugToFirst(projectId, bugId) {
  const bugs = readBugs(projectId);
  const index = bugs.findIndex((b) => b.id === bugId);
  if (index === -1) return null;
  const [bug] = bugs.splice(index, 1);
  bugs.unshift(bug);
  bugs.forEach((b, i) => { b.order = i + 1; });
  writeBugs(projectId, bugs);
  return listBugs(projectId);
}

function reorderBugs(projectId, bugOrders) {
  const bugs = readBugs(projectId);
  for (const item of bugOrders) {
    const bug = bugs.find((b) => b.id === item.id);
    if (bug) bug.order = item.order;
  }
  writeBugs(projectId, bugs);
  return listBugs(projectId);
}

function appendBugHistory(projectId, bugId, entry) {
  const bugs = listBugs(projectId);
  const index = bugs.findIndex((bug) => bug.id === bugId);
  if (index === -1) return null;

  const nextHistory = [
    {
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      ...entry,
    },
    ...(bugs[index].history || []),
  ].slice(0, 100);

  bugs[index] = {
    ...bugs[index],
    history: nextHistory,
    updatedAt: new Date().toISOString(),
  };
  writeBugs(projectId, bugs);
  return bugs[index];
}

function getBugsByTaskId(projectId, taskId) {
  return listBugs(projectId).filter((bug) => bug.relatedTaskId === taskId);
}

module.exports = {
  listBugs,
  getBug,
  createBug,
  updateBug,
  deleteBug,
  reorderBugs,
  moveBugToFirst,
  appendBugHistory,
  getBugsByTaskId,
  BUG_BOARD_STATUSES,
  BUG_EXECUTION_STATUSES,
  BUG_SEVERITY_LEVELS,
  BUG_SOURCES,
};
