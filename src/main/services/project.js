const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { readProjects, writeProjects, DEFAULT_WORKSPACE_ROOT, ensureDefaultWorkspaceRoot } = require('./env-check');

function slugifyProjectName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'project';
}

function ensureProjectStructure(workDir, projectId) {
  fs.mkdirSync(workDir, { recursive: true });

  const vctDir = path.join(workDir, '.vct');
  const logDir = path.join(vctDir, 'logs');
  fs.mkdirSync(logDir, { recursive: true });

  const tasksFile = path.join(vctDir, 'tasks.json');
  if (!fs.existsSync(tasksFile)) {
    fs.writeFileSync(tasksFile, JSON.stringify([], null, 2), 'utf-8');
  }

  const bugsFile = path.join(vctDir, 'bugs.json');
  if (!fs.existsSync(bugsFile)) {
    fs.writeFileSync(bugsFile, JSON.stringify([], null, 2), 'utf-8');
  }

  const progressFile = path.join(vctDir, 'progress.json');
  if (!fs.existsSync(progressFile)) {
    const now = new Date().toISOString();
    fs.writeFileSync(
      progressFile,
      JSON.stringify(
        {
          projectId,
          currentTaskId: null,
          currentPhase: null,
          phaseIndex: 0,
          lastOutput: '',
          lastLogFile: null,
          lastRunAt: null,
          updatedAt: now,
        },
        null,
        2
      ),
      'utf-8'
    );
  }

  const historyFile = path.join(vctDir, 'project-history.json');
  if (!fs.existsSync(historyFile)) {
    fs.writeFileSync(historyFile, JSON.stringify([], null, 2), 'utf-8');
  }
}

function copyVctMetadataIfNeeded(fromDir, toDir) {
  if (!fromDir || !toDir || fromDir === toDir) return;
  const source = path.join(fromDir, '.vct');
  const target = path.join(toDir, '.vct');
  if (!fs.existsSync(source) || fs.existsSync(target)) return;
  fs.mkdirSync(toDir, { recursive: true });
  fs.cpSync(source, target, { recursive: true });
}

function normalizeProject(project) {
  const now = new Date().toISOString();
  return {
    id: project.id,
    name: project.name,
    description: project.description || '',
    workDir: project.workDir,
    status: project.status || 'idle',
    agent: project.agent || 'claude-code',
    autoRun: project.autoRun !== false,
    createdAt: project.createdAt || now,
    updatedAt: project.updatedAt || now,
  };
}

function listProjects() {
  return readProjects().map(normalizeProject);
}

function getProject(id) {
  const projects = listProjects();
  return projects.find(p => p.id === id) || null;
}

function createProject(project) {
  const projects = listProjects();
  const now = new Date().toISOString();
  ensureDefaultWorkspaceRoot();

  const derivedWorkDir = project.workDir && project.workDir.trim()
    ? project.workDir.trim()
    : path.join(DEFAULT_WORKSPACE_ROOT, slugifyProjectName(project.name));

  const newProject = {
    id: uuidv4(),
    name: project.name,
    description: project.description || '',
    workDir: derivedWorkDir,
    status: 'idle', // idle | running | paused
    agent: project.agent || 'claude-code',
    autoRun: project.autoRun !== false,
    createdAt: now,
    updatedAt: now,
  };
  projects.push(newProject);
  writeProjects(projects);

  ensureProjectStructure(newProject.workDir, newProject.id);

  return newProject;
}

function updateProject(id, updates) {
  const projects = listProjects();
  const index = projects.findIndex(p => p.id === id);
  if (index === -1) return null;
  const previousWorkDir = projects[index].workDir;
  projects[index] = { ...projects[index], ...updates, updatedAt: new Date().toISOString() };
  writeProjects(projects);
  copyVctMetadataIfNeeded(previousWorkDir, projects[index].workDir);
  ensureProjectStructure(projects[index].workDir, projects[index].id);
  return projects[index];
}

function deleteProject(id) {
  let projects = readProjects();
  const project = projects.find(p => p.id === id);
  projects = projects.filter(p => p.id !== id);
  writeProjects(projects);
  return project;
}

module.exports = { listProjects, getProject, createProject, updateProject, deleteProject };
