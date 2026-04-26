const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { getAdapter, getSupportedAgents } = require('./cli-adapters');
const { listProjects } = require('./project');
const { listTasks } = require('./task');

const VCT_DIR = path.join(os.homedir(), '.vct');
const AGENTS_FILE = path.join(VCT_DIR, 'agents.json');

function ensureVctDir() {
  if (!fs.existsSync(VCT_DIR)) {
    fs.mkdirSync(VCT_DIR, { recursive: true });
  }
}

function readAgents() {
  ensureVctDir();
  if (!fs.existsSync(AGENTS_FILE)) {
    return [];
  }
  return JSON.parse(fs.readFileSync(AGENTS_FILE, 'utf-8'));
}

function writeAgents(agents) {
  ensureVctDir();
  fs.writeFileSync(AGENTS_FILE, JSON.stringify(agents, null, 2), 'utf-8');
}

/**
 * Agent 配置结构
 * @typedef {Object} AgentConfig
 * @property {string} id - Agent ID
 * @property {string} name - Agent 名称
 * @property {string} description - Agent 描述
 * @property {string} cliType - 基硎 CLI 类型 (claude-code, opencode)
 * @property {string} [systemPrompt] - 系统提示词
 * @property {string} [model] - 自定义模型
 * @property {string} [apiBaseUrl] - 第三方 API 地址
 * @property {string} [apiKey] - API Key (加密存储)
 * @property {Object} [cliSettings] - CLI 特定设置
 * @property {number} [maxTurns] - 最大轮次
 * @property {string} [permissionMode] - 权限模式
 * @property {boolean} [enabled] - 是否启用
 * @property {string} createdAt - 创建时间
 * @property {string} updatedAt - 更新时间
 */

function normalizeAgent(agent) {
  const now = new Date().toISOString();
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description || '',
    cliType: agent.cliType || 'claude-code',
    // 自定义配置
    systemPrompt: agent.systemPrompt || '',
    model: agent.model || '',
    apiBaseUrl: agent.apiBaseUrl || '',
    apiKey: agent.apiKey || '', // TODO: 加密存储
    cliSettings: agent.cliSettings || {},
    // 执行参数
    maxTurns: agent.maxTurns || 30,
    permissionMode: agent.permissionMode || 'bypassPermissions',
    // 状态
    enabled: agent.enabled !== false,
    createdAt: agent.createdAt || now,
    updatedAt: agent.updatedAt || now,
  };
}

/**
 * 列出所有 Agent
 * @returns {AgentConfig[]}
 */
function listAgents() {
  return readAgents().map(normalizeAgent);
}

/**
 * 获取单个 Agent
 * @param {string} agentId
 * @returns {AgentConfig|null}
 */
function getAgent(agentId) {
  const agents = listAgents();
  return agents.find((a) => a.id === agentId) || null;
}

/**
 * 创建 Agent
 * @param {AgentConfig} agent
 * @returns {AgentConfig}
 */
function createAgent(agent) {
  const agents = readAgents();
  const now = new Date().toISOString();

  const newAgent = normalizeAgent({
    id: uuidv4(),
    ...agent,
    createdAt: now,
    updatedAt: now,
  });

  agents.push(newAgent);
  writeAgents(agents);
  return newAgent;
}

/**
 * 更新 Agent
 * @param {string} agentId
 * @param {Partial<AgentConfig>} updates
 * @returns {AgentConfig|null}
 */
function updateAgent(agentId, updates) {
  const agents = readAgents();
  const index = agents.findIndex((a) => a.id === agentId);
  if (index === -1) return null;

  const updated = normalizeAgent({
    ...agents[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  });

  agents[index] = updated;
  writeAgents(agents);
  return updated;
}

/**
 * 删除 Agent
 * @param {string} agentId
 * @returns {AgentConfig|null}
 */
function deleteAgent(agentId) {
  const agents = readAgents();
  const agent = agents.find((a) => a.id === agentId);
  if (!agent) return null;

  const filtered = agents.filter((a) => a.id !== agentId);
  writeAgents(filtered);
  return agent;
}

/**
 * 获取 Agent 的 CLI 适配器实例
 * @param {string} agentId
 * @returns {Object} { adapter, config }
 */
function getAgentAdapter(agentId) {
  const agent = getAgent(agentId);
  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  const adapter = getAdapter(agent.cliType);

  return {
    adapter,
    agent,
  };
}

/**
 * 检查 Agent 是否有自定义 API 配置
 * @param {AgentConfig} agent
 * @returns {boolean}
 */
function hasCustomApiConfig(agent) {
  return !!(agent.apiKey || agent.apiBaseUrl || agent.model);
}

/**
 * 构建 Claude Code 的 settings 配置对象
 * 参考: https://docs.anthropic.com/en/docs/claude-code/settings
 * @param {AgentConfig} agent
 * @returns {Object|null}
 */
function buildClaudeSettings(agent) {
  if (!hasCustomApiConfig(agent)) {
    return null;
  }

  const settings = {};

  // API Key - 使用环境变量名 ANTHROPIC_AUTH_TOKEN
  if (agent.apiKey) {
    settings.env = {
      ...settings.env,
      ANTHROPIC_AUTH_TOKEN: agent.apiKey,
    };
  }

  // API Base URL
  if (agent.apiBaseUrl) {
    settings.env = {
      ...settings.env,
      ANTHROPIC_BASE_URL: agent.apiBaseUrl,
    };
  }

  // 模型配置
  if (agent.model) {
    settings.env = {
      ...settings.env,
      ANTHROPIC_MODEL: agent.model,
    };
  }

  // 合并其他 CLI 设置
  if (agent.cliSettings && typeof agent.cliSettings === 'object') {
    Object.assign(settings, agent.cliSettings);
  }

  return Object.keys(settings).length > 0 ? settings : null;
}

/**
 * 构建 Agent 的命令参数
 * @param {string} agentId
 * @param {Object} options - 执行选项
 * @returns {{ executable: string, args: string[], env: Object, hasCustomConfig: boolean }}
 */
function buildAgentCommand(agentId, options) {
  const { adapter, agent } = getAgentAdapter(agentId);

  // 合并执行参数
  const execOptions = {
    ...options,
    maxTurns: agent.maxTurns || 30,
    permissionMode: agent.permissionMode || 'bypassPermissions',
  };

  // 构建基础参数
  let args = adapter.buildCommandArgs(execOptions);

  // 检查是否有自定义 API 配置
  const hasCustomConfig = hasCustomApiConfig(agent);

  // 根据不同 CLI 类型添加配置
  if (agent.cliType === 'claude-code') {
    // Claude Code 使用 --settings 参数传递配置
    const settings = buildClaudeSettings(agent);
    if (settings) {
      // 使用 JSON 字符串传递 settings
      args.push('--settings', JSON.stringify(settings));
    }

    // 系统提示词 - 使用 --append-system-prompt 追加
    // 注意：即使没有自定义 API 配置，系统提示词也需要添加
    if (agent.systemPrompt) {
      args.push('--append-system-prompt', agent.systemPrompt);
    }
  } else if (agent.cliType === 'opencode') {
    // OpenCode 的参数处理
    // 系统提示词
    if (agent.systemPrompt) {
      args.push('--system-prompt', agent.systemPrompt);
    }

    // 自定义模型
    if (agent.model) {
      args.push('--model', agent.model);
    }

    // API Base URL
    if (agent.apiBaseUrl) {
      args.push('--api-base-url', agent.apiBaseUrl);
    }
  }

  // 构建环境变量
  // 如果没有自定义配置，使用 CLI 本身的配置（不设置额外环境变量）
  const env = { ...process.env };

  // 只有配置了 API Key 才设置环境变量
  if (agent.apiKey) {
    if (agent.cliType === 'claude-code') {
      // Claude Code 优先使用 settings 中的配置
      // 这里设置环境变量作为备用
      env.ANTHROPIC_API_KEY = agent.apiKey;
    } else if (agent.cliType === 'opencode') {
      env.OPENAI_API_KEY = agent.apiKey;
    }
  }

  return {
    executable: adapter.executable,
    args,
    env,
    adapter,
    agent,
    hasCustomConfig,
  };
}

/**
 * 获取默认 Agent 列表（基于已安装的 CLI）
 * @returns {AgentConfig[]}
 */
function getDefaultAgents() {
  const supportedAgents = getSupportedAgents();
  const existingAgents = listAgents();

  // 返回已创建的 Agent，如果没有则返回空数组
  // 用户需要手动创建 Agent
  return existingAgents;
}

/**
 * 检查 Agent 是否可用
 * @param {string} agentId
 * @returns {Promise<{available: boolean, error?: string}>}
 */
async function checkAgentAvailable(agentId) {
  try {
    const { adapter, agent } = getAgentAdapter(agentId);

    if (!agent.enabled) {
      return { available: false, error: 'Agent 已禁用' };
    }

    // 检查基础 CLI 是否安装
    const checkResult = await adapter.checkInstallation();
    if (!checkResult.installed) {
      return { available: false, error: `${adapter.displayName} CLI 未安装: ${checkResult.error}` };
    }

    return { available: true };
  } catch (e) {
    return { available: false, error: e.message };
  }
}

/**
 * 获取所有 Agent 的任务状态
 * 包括原生 CLI 和自定义 Agent
 * @returns {Object} { agentId: { tasks: [], projects: [] } }
 */
function getAgentTasks() {
  const result = {};
  const projects = listProjects();
  const customAgents = listAgents();
  const supportedCLIs = getSupportedAgents();

  // 初始化所有 Agent 的数据结构
  // 原生 CLI
  supportedCLIs.forEach(cliType => {
    result[`cli-${cliType}`] = { tasks: [], projects: [] };
  });

  // 自定义 Agent
  customAgents.forEach(agent => {
    result[agent.id] = { tasks: [], projects: [] };
  });

  // 遍历所有项目，收集任务数据
  projects.forEach(project => {
    try {
      const tasks = listTasks(project.id);

      tasks.forEach(task => {
        // 根据任务的 agentId 分配到对应的 Agent
        if (task.agentId) {
          // 任务指定了自定义 Agent
          if (result[task.agentId]) {
            result[task.agentId].tasks.push({ ...task, projectId: project.id });
            // 避免重复添加项目
            if (!result[task.agentId].projects.find(p => p.id === project.id)) {
              result[task.agentId].projects.push(project);
            }
          }
        } else {
          // 任务使用项目默认 CLI
          const defaultCliType = project.agent || 'claude-code';
          const cliAgentId = `cli-${defaultCliType}`;
          if (result[cliAgentId]) {
            result[cliAgentId].tasks.push({ ...task, projectId: project.id });
            if (!result[cliAgentId].projects.find(p => p.id === project.id)) {
              result[cliAgentId].projects.push(project);
            }
          }
        }
      });
    } catch (e) {
      console.error(`Failed to get tasks for project ${project.id}:`, e.message);
    }
  });

  return result;
}

module.exports = {
  listAgents,
  getAgent,
  createAgent,
  updateAgent,
  deleteAgent,
  getAgentAdapter,
  buildAgentCommand,
  buildClaudeSettings,
  hasCustomApiConfig,
  getDefaultAgents,
  checkAgentAvailable,
  normalizeAgent,
  getAgentTasks,
};