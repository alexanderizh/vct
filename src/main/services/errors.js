/**
 * 错误类型枚举
 */
const ErrorTypes = {
  // CLI 级别错误
  CLI_NOT_INSTALLED: 'cli_not_installed',
  CLI_AUTH_FAILED: 'cli_auth_failed',
  CLI_PROCESS_ERROR: 'cli_process_error',
  CLI_TIMEOUT: 'cli_timeout',

  // 执行级别错误
  EXECUTION_FAILED: 'execution_failed',
  PHASE_FAILED: 'phase_failed',
  TASK_FAILED: 'task_failed',

  // 网络错误
  NETWORK_ERROR: 'network_error',
  API_RATE_LIMIT: 'api_rate_limit',
  API_ERROR: 'api_error',

  // 文件系统错误
  FS_ERROR: 'fs_error',
  GIT_ERROR: 'git_error',

  // 未知错误
  UNKNOWN: 'unknown',
};

/**
 * 错误严重程度
 */
const ErrorSeverity = {
  LOW: 'low',           // 可忽略，不影响执行
  MEDIUM: 'medium',     // 需要处理，但可继续
  HIGH: 'high',         // 需要中断当前操作
  CRITICAL: 'critical', // 需要完全停止
};

/**
 * VCT 错误类
 */
class VCTError extends Error {
  constructor(type, message, options = {}) {
    super(message);
    this.name = 'VCTError';
    this.type = type;
    this.severity = options.severity || ErrorSeverity.MEDIUM;
    this.recoverable = options.recoverable !== false;
    this.context = options.context || {};
    this.originalError = options.originalError || null;
    this.suggestedAction = options.suggestedAction || null;
  }

  toJSON() {
    return {
      name: this.name,
      type: this.type,
      message: this.message,
      severity: this.severity,
      recoverable: this.recoverable,
      context: this.context,
      suggestedAction: this.suggestedAction,
    };
  }

  /**
   * 获取用户友好的错误消息
   * @returns {string}
   */
  getUserMessage() {
    const messages = {
      [ErrorTypes.CLI_NOT_INSTALLED]: `${this.context.cliName || 'CLI'} 未安装，请先安装后再试`,
      [ErrorTypes.CLI_AUTH_FAILED]: `${this.context.cliName || 'CLI'} 认证失败，请检查登录状态`,
      [ErrorTypes.CLI_PROCESS_ERROR]: `进程执行错误: ${this.message}`,
      [ErrorTypes.CLI_TIMEOUT]: `执行超时，请检查网络连接或增加超时时间`,
      [ErrorTypes.NETWORK_ERROR]: `网络连接失败: ${this.message}`,
      [ErrorTypes.API_RATE_LIMIT]: `API 请求限流，请稍后重试`,
      [ErrorTypes.API_ERROR]: `API 错误: ${this.message}`,
      [ErrorTypes.PHASE_FAILED]: `阶段执行失败: ${this.context.phaseName || this.message}`,
      [ErrorTypes.GIT_ERROR]: `Git 操作失败: ${this.message}`,
      [ErrorTypes.FS_ERROR]: `文件系统错误: ${this.message}`,
      [ErrorTypes.UNKNOWN]: this.message,
    };
    return messages[this.type] || this.message;
  }
}

/**
 * 错误处理器
 */
class ErrorHandler {
  constructor() {
    this.handlers = new Map();
    this._registerDefaultHandlers();
  }

  _registerDefaultHandlers() {
    // CLI 未安装
    this.register(ErrorTypes.CLI_NOT_INSTALLED, (error, context) => {
      return {
        action: 'abort',
        message: error.getUserMessage(),
        suggestion: `运行安装命令安装 ${error.context.cliName || 'CLI'}`,
      };
    });

    // CLI 认证失败
    this.register(ErrorTypes.CLI_AUTH_FAILED, (error, context) => {
      return {
        action: 'abort',
        message: error.getUserMessage(),
        suggestion: `请运行登录命令进行认证`,
      };
    });

    // API 限流
    this.register(ErrorTypes.API_RATE_LIMIT, (error, context) => {
      return {
        action: 'retry',
        delay: 60000, // 1 分钟后重试
        message: 'API 请求限流，将在 60 秒后自动重试',
        maxRetries: 3,
      };
    });

    // 网络错误
    this.register(ErrorTypes.NETWORK_ERROR, (error, context) => {
      return {
        action: 'retry',
        delay: 5000,
        message: '网络连接失败，将在 5 秒后自动重试',
        maxRetries: 3,
      };
    });

    // 执行超时
    this.register(ErrorTypes.CLI_TIMEOUT, (error, context) => {
      return {
        action: 'retry',
        delay: 2000,
        message: '执行超时，将在 2 秒后重试',
        maxRetries: 2,
      };
    });

    // 阶段失败
    this.register(ErrorTypes.PHASE_FAILED, (error, context) => {
      return {
        action: 'pause',
        message: error.getUserMessage(),
        suggestion: '请检查错误日志，修复问题后重新启动',
      };
    });

    // 进程错误
    this.register(ErrorTypes.CLI_PROCESS_ERROR, (error, context) => {
      return {
        action: 'pause',
        message: error.getUserMessage(),
        suggestion: '请检查终端输出，确认问题后重新启动',
      };
    });
  }

  /**
   * 注册错误处理器
   * @param {string} errorType - 错误类型
   * @param {Function} handler - 处理函数
   */
  register(errorType, handler) {
    this.handlers.set(errorType, handler);
  }

  /**
   * 处理错误
   * @param {Error} error - 错误对象
   * @param {Object} context - 上下文信息
   * @returns {Object} 处理结果
   */
  handle(error, context = {}) {
    const vctError = error instanceof VCTError ? error : this._wrapError(error);

    const handler = this.handlers.get(vctError.type);
    const result = handler ? handler(vctError, context) : this._defaultHandler(vctError, context);

    return {
      error: vctError,
      ...result,
    };
  }

  /**
   * 将普通错误包装为 VCTError
   * @param {Error} error - 原始错误
   * @returns {VCTError}
   */
  _wrapError(error) {
    const message = error.message || String(error);

    // 根据错误消息推断类型
    if (message.includes('rate limit') || message.includes('429') || message.includes('Too Many Requests')) {
      return new VCTError(ErrorTypes.API_RATE_LIMIT, message, { originalError: error });
    }

    if (
      message.includes('network') ||
      message.includes('ECONNREFUSED') ||
      message.includes('ETIMEDOUT') ||
      message.includes('ENOTFOUND') ||
      message.includes('socket hang up')
    ) {
      return new VCTError(ErrorTypes.NETWORK_ERROR, message, { originalError: error });
    }

    if (message.includes('not found') || message.includes('ENOENT') || message.includes('which claude')) {
      return new VCTError(ErrorTypes.CLI_NOT_INSTALLED, message, {
        originalError: error,
        context: { cliName: 'CLI' },
      });
    }

    if (message.includes('auth') || message.includes('login') || message.includes('credential')) {
      return new VCTError(ErrorTypes.CLI_AUTH_FAILED, message, { originalError: error });
    }

    if (message.includes('timeout') || message.includes('Timeout')) {
      return new VCTError(ErrorTypes.CLI_TIMEOUT, message, { originalError: error });
    }

    if (message.includes('git') || message.includes('Git')) {
      return new VCTError(ErrorTypes.GIT_ERROR, message, { originalError: error });
    }

    if (message.includes('exited with code') || message.includes('spawn')) {
      return new VCTError(ErrorTypes.CLI_PROCESS_ERROR, message, { originalError: error });
    }

    return new VCTError(ErrorTypes.UNKNOWN, message, { originalError: error });
  }

  _defaultHandler(error, context) {
    return {
      action: error.recoverable ? 'pause' : 'abort',
      message: error.getUserMessage(),
    };
  }
}

/**
 * 创建 VCTError 的便捷函数
 * @param {string} type - 错误类型
 * @param {string} message - 错误消息
 * @param {Object} options - 选项
 * @returns {VCTError}
 */
function createError(type, message, options = {}) {
  return new VCTError(type, message, options);
}

module.exports = {
  ErrorTypes,
  ErrorSeverity,
  VCTError,
  ErrorHandler,
  createError,
};