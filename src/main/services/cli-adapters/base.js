/**
 * CLI 适配器基类
 * 所有具体适配器必须继承并实现这些方法
 */
class BaseCLIAdapter {
  constructor(config = {}) {
    this.config = config;
  }

  /**
   * CLI 名称标识
   * @returns {string}
   */
  get name() {
    throw new Error('Not implemented: name');
  }

  /**
   * CLI 可执行文件名或路径
   * @returns {string}
   */
  get executable() {
    throw new Error('Not implemented: executable');
  }

  /**
   * 检测 CLI 是否安装及认证状态
   * @returns {Promise<{installed: boolean, version: string|null, authStatus: string|null, error?: string}>}
   */
  async checkInstallation() {
    throw new Error('Not implemented: checkInstallation');
  }

  /**
   * 构建命令参数
   * @param {Object} options - 执行选项
   * @param {string} options.prompt - 用户提示
   * @param {string} options.workDir - 工作目录
   * @param {string} [options.sessionId] - 会话ID用于恢复
   * @param {number} [options.maxTurns] - 最大轮次
   * @returns {string[]} 命令参数数组
   */
  buildCommandArgs(options) {
    throw new Error('Not implemented: buildCommandArgs');
  }

  /**
   * 解析标准输出流中的 JSON 行
   * @param {string} line - 单行 JSON 字符串
   * @returns {{type: string, text: string, sessionId?: string, error?: string}} 解析结果
   */
  parseOutputLine(line) {
    throw new Error('Not implemented: parseOutputLine');
  }

  /**
   * 从错误输出中提取用户友好的错误信息
   * @param {string} stderr - 错误输出
   * @returns {string} 格式化的错误信息
   */
  formatError(stderr) {
    throw new Error('Not implemented: formatError');
  }

  /**
   * 获取可打印的输出文本
   * @param {Object} event - 解析后的事件对象
   * @returns {string} 可打印文本
   */
  extractPrintableText(event) {
    throw new Error('Not implemented: extractPrintableText');
  }

  /**
   * 获取 CLI 显示名称
   * @returns {string}
   */
  get displayName() {
    return this.name;
  }
}

module.exports = { BaseCLIAdapter };
