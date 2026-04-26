const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const { BaseCLIAdapter } = require('./base');

const execAsync = promisify(exec);

/**
 * OpenCode CLI 适配器
 *
 * OpenCode 是一个开源的 AI 编程助手 CLI 工具
 * 文档: https://github.com/opencode-ai/opencode
 */
class OpenCodeAdapter extends BaseCLIAdapter {
  get name() {
    return 'opencode';
  }

  get displayName() {
    return 'OpenCode';
  }

  get executable() {
    return this.config.executablePath || 'opencode';
  }

  async checkInstallation() {
    try {
      // 使用异步 exec 避免阻塞事件循环
      const { stdout: versionOut } = await execAsync(`${this._escapeExecutable(this.executable)} --version`, {
        timeout: 10000,
        encoding: 'utf8',
      });
      const version = versionOut.trim();

      // 检查 provider 认证状态
      let authStatus = '';
      try {
        const { stdout: providersOut } = await execAsync(`${this._escapeExecutable(this.executable)} providers list`, {
          timeout: 10000,
          encoding: 'utf8',
        });
        const providers = providersOut.trim();

        // 解析 provider 状态
        if (providers.includes('active') || providers.includes('configured')) {
          authStatus = '已配置';
        } else if (providers.includes('no provider') || providers.includes('not configured')) {
          authStatus = '未配置 provider，请运行 opencode providers login';
        } else {
          authStatus = providers.slice(0, 100);
        }
      } catch (e) {
        // 如果 providers 命令不存在，尝试其他方式
        try {
          const { stdout: configOut } = await execAsync(`${this._escapeExecutable(this.executable)} config show`, {
            timeout: 10000,
            encoding: 'utf8',
          });
          const config = configOut.trim();
          authStatus = config.includes('api_key') ? '已配置' : '未配置';
        } catch (e2) {
          authStatus = '无法检查认证状态';
        }
      }

      return {
        installed: true,
        version,
        authStatus,
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

  /**
   * 安全转义可执行文件路径，防止命令注入
   */
  _escapeExecutable(executable) {
    // 如果包含特殊字符，用引号包裹
    if (/[^a-zA-Z0-9_\-./]/.test(executable)) {
      return `"${executable.replace(/"/g, '\\"')}"`;
    }
    return executable;
  }

  buildCommandArgs(options) {
    const { prompt, workDir, sessionId, maxTurns = 30 } = options;

    const args = [
      'run',
      prompt,
      '--format', 'json',
      '--dangerously-skip-permissions',
      '--dir', workDir,
    ];

    // 会话恢复
    if (sessionId) {
      args.push('--session', sessionId);
    }

    // 最大轮次
    if (maxTurns) {
      args.push('--max-turns', String(maxTurns));
    }

    // 模型选择 (如果配置)
    if (this.config.model) {
      args.push('--model', this.config.model);
    }

    // Agent 选择 (如果配置)
    if (this.config.agent) {
      args.push('--agent', this.config.agent);
    }

    return args;
  }

  parseOutputLine(line) {
    if (!line || !line.trim()) {
      return { type: 'empty', text: '' };
    }

    try {
      const event = JSON.parse(line);
      return this._normalizeEvent(event);
    } catch (e) {
      // 非 JSON 行，作为原始文本返回
      return { type: 'raw', text: line };
    }
  }

  _normalizeEvent(event) {
    // OpenCode JSON 输出格式 (根据实际 CLI 输出调整)
    // 可能的格式:
    // 1. { type: 'message', content: '...', role: 'assistant' }
    // 2. { type: 'tool_use', name: '...', input: {} }
    // 3. { type: 'session', id: '...' }
    // 4. { type: 'error', message: '...' }
    // 5. { type: 'thinking', content: '...' }
    // 6. { type: 'result', success: true/false }

    switch (event.type) {
      case 'message':
      case 'content':
        return {
          type: 'content',
          text: event.content || event.text || '',
          sessionId: event.session_id,
        };

      case 'tool_use':
      case 'tool':
        return {
          type: 'tool',
          text: `\n🔧 使用工具: ${event.name || 'unknown'}\n`,
          toolName: event.name,
        };

      case 'tool_result':
        return {
          type: 'tool_result',
          text: event.content || '',
        };

      case 'thinking':
        return {
          type: 'thinking',
          text: event.content ? `\n💭 思考: ${event.content}\n` : '',
        };

      case 'session':
        return {
          type: 'session',
          sessionId: event.id || event.session_id,
          text: '',
        };

      case 'error':
        return {
          type: 'error',
          text: `\n❌ 错误: ${event.message || '未知错误'}\n`,
          error: event.message,
        };

      case 'result':
        return {
          type: 'result',
          text: event.success ? '\n✅ 任务执行完成\n' : `\n❌ 执行失败: ${event.error || ''}\n`,
          success: event.success,
        };

      case 'status':
        return {
          type: 'status',
          text: `\n[OpenCode 状态] ${event.message || event.status || ''}\n`,
        };

      // 兼容其他可能的格式
      case 'text':
        return {
          type: 'content',
          text: event.text || event.content || '',
        };

      case 'delta':
        return {
          type: 'content',
          text: event.delta || event.text || '',
        };

      default:
        // 尝试从常见字段提取内容
        if (event.content && typeof event.content === 'string') {
          return { type: 'content', text: event.content };
        }
        if (event.text && typeof event.text === 'string') {
          return { type: 'content', text: event.text };
        }
        if (event.message && typeof event.message === 'string') {
          return { type: 'content', text: event.message };
        }
        return { type: 'unknown', text: '', raw: event };
    }
  }

  formatError(stderr) {
    if (!stderr) return '未知错误';

    const lines = stderr.split('\n');
    const errorLines = lines.filter(
      (line) =>
        line.toLowerCase().includes('error') ||
        line.toLowerCase().includes('failed') ||
        line.toLowerCase().includes('exception') ||
        line.toLowerCase().includes('fatal')
    );

    if (errorLines.length > 0) {
      return errorLines.slice(0, 5).join('\n');
    }
    return stderr.slice(-500);
  }

  extractPrintableText(event) {
    if (!event || typeof event !== 'object') return '';

    switch (event.type) {
      case 'content':
      case 'tool':
      case 'tool_result':
      case 'thinking':
      case 'error':
      case 'result':
      case 'status':
        return event.text || '';
      default:
        return event.text || '';
    }
  }
}

module.exports = { OpenCodeAdapter };
