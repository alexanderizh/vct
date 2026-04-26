const { ClaudeCodeAdapter } = require('./claude-code');
const { OpenCodeAdapter } = require('./opencode');

// 注册的适配器映射
const adapters = {
  'claude-code': ClaudeCodeAdapter,
  'opencode': OpenCodeAdapter,
};

// 默认配置
const defaultConfigs = {
  'claude-code': {},
  'opencode': {},
};

/**
 * 获取 CLI 适配器实例
 * @param {string} agentType - agent 类型
 * @param {Object} config - 可选配置
 * @returns {BaseCLIAdapter} 适配器实例
 */
function getAdapter(agentType, config = {}) {
  const AdapterClass = adapters[agentType];
  if (!AdapterClass) {
    throw new Error(`Unknown CLI agent type: ${agentType}`);
  }
  const mergedConfig = { ...defaultConfigs[agentType], ...config };
  return new AdapterClass(mergedConfig);
}

/**
 * 获取所有支持的 agent 类型
 * @returns {string[]} agent 类型列表
 */
function getSupportedAgents() {
  return Object.keys(adapters);
}

/**
 * 获取所有 agent 的显示信息
 * @returns {Array<{key: string, name: string, displayName: string}>}
 */
function getAgentInfoList() {
  return Object.entries(adapters).map(([key, AdapterClass]) => {
    const adapter = new AdapterClass(defaultConfigs[key]);
    return {
      key,
      name: adapter.name,
      displayName: adapter.displayName,
    };
  });
}

/**
 * 检测所有已安装的 CLI
 * @returns {Promise<Object>} 检测结果映射
 */
async function checkAllCLIs() {
  const results = {};
  for (const [agentType, AdapterClass] of Object.entries(adapters)) {
    const adapter = new AdapterClass(defaultConfigs[agentType]);
    results[agentType] = await adapter.checkInstallation();
  }
  return results;
}

/**
 * 检测单个 CLI
 * @param {string} agentType - agent 类型
 * @returns {Promise<Object>} 检测结果
 */
async function checkCLI(agentType) {
  const AdapterClass = adapters[agentType];
  if (!AdapterClass) {
    return {
      installed: false,
      version: null,
      authStatus: null,
      error: `Unknown agent type: ${agentType}`,
    };
  }
  const adapter = new AdapterClass(defaultConfigs[agentType]);
  return adapter.checkInstallation();
}

module.exports = {
  getAdapter,
  getSupportedAgents,
  getAgentInfoList,
  checkAllCLIs,
  checkCLI,
  adapters,
};
