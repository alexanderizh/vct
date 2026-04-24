const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const VCT_DIR = path.join(os.homedir(), '.vct');
const PROJECTS_FILE = path.join(VCT_DIR, 'projects.json');
const DEFAULT_WORKSPACE_ROOT = path.join(process.cwd(), 'workspaces');

function ensureVctDir() {
  if (!fs.existsSync(VCT_DIR)) {
    fs.mkdirSync(VCT_DIR, { recursive: true });
  }
}

function ensureDefaultWorkspaceRoot() {
  if (!fs.existsSync(DEFAULT_WORKSPACE_ROOT)) {
    fs.mkdirSync(DEFAULT_WORKSPACE_ROOT, { recursive: true });
  }
}

function readProjects() {
  ensureVctDir();
  if (!fs.existsSync(PROJECTS_FILE)) {
    return [];
  }
  return JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf-8'));
}

function writeProjects(projects) {
  ensureVctDir();
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2), 'utf-8');
}

async function checkClaude() {
  try {
    const version = execSync('claude --version 2>&1', { timeout: 10000 }).toString().trim();
    let authStatus = '';
    try {
      authStatus = execSync('claude auth status --text 2>&1', { timeout: 10000 }).toString().trim();
    } catch (e) {
      authStatus = 'Unknown (auth check failed)';
    }
    return {
      installed: true,
      version: version,
      authStatus: authStatus,
    };
  } catch (e) {
    return {
      installed: false,
      version: null,
      authStatus: null,
      error: e.message,
    };
  }
}

async function checkGit() {
  try {
    const version = execSync('git --version 2>&1', { timeout: 10000 }).toString().trim();
    return {
      installed: true,
      version: version,
    };
  } catch (e) {
    return {
      installed: false,
      version: null,
      error: e.message,
    };
  }
}

module.exports = {
  checkClaude,
  checkGit,
  readProjects,
  writeProjects,
  ensureVctDir,
  ensureDefaultWorkspaceRoot,
  VCT_DIR,
  DEFAULT_WORKSPACE_ROOT,
};
