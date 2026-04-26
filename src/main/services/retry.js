/**
 * 带指数退避的重试执行器
 */
class RetryExecutor {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.baseDelay = options.baseDelay || 1000;
    this.maxDelay = options.maxDelay || 60000;
    this.multiplier = options.multiplier || 2;
  }

  /**
   * 执行带重试的异步操作
   * @param {Function} fn - 要执行的异步函数
   * @param {Function} [shouldRetry] - 判断是否应重试的函数 (error, attempt) => boolean
   * @param {Function} [onRetry] - 重试前的回调函数 (error, attempt, delay) => void
   * @returns {Promise} 执行结果
   */
  async execute(fn, shouldRetry = null, onRetry = null) {
    let lastError;
    let delay = this.baseDelay;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        // 检查是否应重试
        const shouldRetryResult = shouldRetry ? shouldRetry(error, attempt) : this._shouldRetryDefault(error);

        if (!shouldRetryResult || attempt >= this.maxRetries) {
          throw error;
        }

        // 调用重试回调
        if (onRetry) {
          onRetry(error, attempt, delay);
        }

        // 等待后重试
        await this._sleep(delay);
        delay = Math.min(delay * this.multiplier, this.maxDelay);
      }
    }

    throw lastError;
  }

  /**
   * 默认重试判断逻辑
   * @param {Error} error - 错误对象
   * @returns {boolean} 是否应重试
   */
  _shouldRetryDefault(error) {
    const message = error.message || '';
    const type = error.type || '';

    // 网络相关错误可重试
    if (
      message.includes('rate limit') ||
      message.includes('429') ||
      message.includes('Too Many Requests') ||
      message.includes('network') ||
      message.includes('ECONNREFUSED') ||
      message.includes('ETIMEDOUT') ||
      message.includes('ENOTFOUND') ||
      message.includes('socket hang up') ||
      message.includes('timeout') ||
      type === 'api_rate_limit' ||
      type === 'network_error' ||
      type === 'cli_timeout'
    ) {
      return true;
    }

    // CLI 安装和认证错误不重试
    if (
      type === 'cli_not_installed' ||
      type === 'cli_auth_failed' ||
      message.includes('not found') ||
      message.includes('not installed')
    ) {
      return false;
    }

    return false;
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * 创建重试执行器的便捷函数
 * @param {Object} options - 配置选项
 * @returns {RetryExecutor}
 */
function createRetryExecutor(options = {}) {
  return new RetryExecutor(options);
}

module.exports = { RetryExecutor, createRetryExecutor };