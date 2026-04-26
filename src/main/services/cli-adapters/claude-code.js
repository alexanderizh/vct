const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const { BaseCLIAdapter } = require('./base');

const execAsync = promisify(exec);

/**
 * Claude Code CLI 适配器
 */
class ClaudeCodeAdapter extends BaseCLIAdapter {
  get name() {
    return 'claude-code';
  }

  get displayName() {
    return 'Claude Code';
  }

  get executable() {
    return this.config.executablePath || 'claude';
  }

  async checkInstallation() {
    try {
      // 使用异步 exec 避免阻塞事件循环
      const { stdout: versionOut } = await execAsync(`${this._escapeExecutable(this.executable)} --version`, {
        timeout: 10000,
        encoding: 'utf8',
      });
      const version = versionOut.trim();

      let authStatus = '';
      try {
        const { stdout: authOut } = await execAsync(`${this._escapeExecutable(this.executable)} auth status --text`, {
          timeout: 10000,
          encoding: 'utf8',
        });
        authStatus = authOut.trim();
      } catch (e) {
        authStatus = 'Unknown (auth check failed)';
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
      '-p', prompt,
      '--permission-mode', 'bypassPermissions',
      '--max-turns', String(maxTurns),
      '--output-format', 'stream-json',
      '--include-partial-messages',
      '--verbose',
      '--add-dir', workDir,
    ];

    if (sessionId) {
      args.push('--resume', sessionId);
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
      return { type: 'raw', text: line };
    }
  }

  _normalizeEvent(event) {
    // Stream text delta - main output path
    if (event.type === 'stream_event' && event.event?.type === 'content_block_delta') {
      const delta = event.event.delta;
      if (delta?.type === 'text_delta') {
        return { type: 'content', text: delta.text || '' };
      }
      if (delta?.type === 'input_json_delta') {
        return { type: 'tool_input', text: '' };
      }
    }

    // Tool use start
    if (event.type === 'stream_event' && event.event?.type === 'content_block_start') {
      const block = event.event.content_block;
      if (block?.type === 'tool_use') {
        return { type: 'tool', text: `\n🔧 使用工具: ${block.name}\n`, toolName: block.name };
      }
    }

    // System status messages
    if (event.type === 'system' && event.subtype === 'status' && event.status) {
      return { type: 'status', text: `\n[Claude 状态] ${event.status}\n` };
    }

    if (event.type === 'system' && event.subtype === 'api_retry') {
      return {
        type: 'retry',
        text: `[Claude 重试] 第 ${event.attempt}/${event.max_retries} 次，${event.retry_delay_ms}ms 后重试\n`,
      };
    }

    // Session ID
    if (event.type === 'system' && event.session_id) {
      return { type: 'session', sessionId: event.session_id, text: '' };
    }

    // Result messages
    if (event.type === 'result' && event.subtype === 'success') {
      return { type: 'result', text: '\n✅ 任务执行完成\n', success: true };
    }

    if (event.type === 'result' && event.subtype === 'error') {
      return { type: 'error', text: `\n❌ 错误: ${event.error || '未知错误'}\n`, error: event.error };
    }

    // Permission prompts
    if (event.type === 'system' && event.subtype === 'permission_prompt') {
      return { type: 'permission', text: `\n⚠️ 权限请求: ${event.message || ''}\n` };
    }

    // Assistant message content (fallback)
    if (event.type === 'assistant' && event.message?.content) {
      const content = this._flattenContent(event.message.content);
      return { type: 'content', text: content };
    }

    // Result field (fallback)
    if (event.type === 'result' && typeof event.result === 'string') {
      return { type: 'result_content', text: event.result };
    }

    return { type: 'unknown', text: '' };
  }

  _flattenContent(content) {
    if (typeof content === 'string') return `${content}\n`;
    if (!Array.isArray(content)) return '';
    return content
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item?.type === 'text') return item.text || '';
        return '';
      })
      .filter(Boolean)
      .join('') + '\n';
  }

  formatError(stderr) {
    if (!stderr) return '未知错误';
    // 提取关键错误信息
    const lines = stderr.split('\n');
    const errorLines = lines.filter(
      (line) =>
        line.toLowerCase().includes('error') ||
        line.toLowerCase().includes('failed') ||
        line.toLowerCase().includes('exception')
    );
    if (errorLines.length > 0) {
      return errorLines.slice(0, 5).join('\n');
    }
    return stderr.slice(-500);
  }

  extractPrintableText(event) {
    if (!event || typeof event !== 'object') return '';
    return event.text || '';
  }
}

module.exports = { ClaudeCodeAdapter };
