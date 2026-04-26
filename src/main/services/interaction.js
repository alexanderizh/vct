const { v4: uuidv4 } = require('uuid');

// 等待中的交互: interactionId -> { resolve, reject, timer, projectId, taskId, proc }
const pendingInteractions = new Map();

// 交互超时时间（毫秒）
const INTERACTION_TIMEOUT = 30 * 60 * 1000; // 30 分钟

// 交互类型枚举
const INTERACTION_TYPES = {
  CONFIRM: 'confirm',           // 确认型：是/否
  CHOICE: 'choice',             // 选择型：多选一
  INPUT: 'input',               // 输入型：文本输入
  MULTI_INPUT: 'multi_input',   // 多项输入
};

// 交互状态枚举
const INTERACTION_STATUS = {
  PENDING: 'pending',           // 等待用户响应
  ANSWERED: 'answered',         // 已回答
  TIMEOUT: 'timeout',           // 超时
  CANCELLED: 'cancelled',       // 已取消
};

/**
 * 创建交互请求并等待用户响应
 * @param {Object} options - 交互选项
 * @param {string} options.projectId - 项目 ID
 * @param {string} options.taskId - 任务 ID
 * @param {string} options.interactionType - 交互类型
 * @param {string} options.question - 问题标题
 * @param {string} [options.description] - 详细描述
 * @param {Array} [options.options] - 选项（choice 类型）
 * @param {any} [options.defaultValue] - 默认值
 * @param {string} [options.placeholder] - 输入提示
 * @param {string} [options.phase] - 触发阶段
 * @param {string} [options.permissionId] - 权限请求 ID
 * @param {Object} mainWindow - Electron 主窗口
 * @param {Object} proc - CLI 进程实例
 * @returns {Promise<any>} 用户回答
 */
async function createInteraction(options, mainWindow, proc) {
  const {
    projectId,
    taskId,
    interactionType,
    question,
    description,
    options: choiceOptions,
    defaultValue,
    placeholder,
    phase,
    permissionId,
  } = options;

  const interactionId = uuidv4();
  const now = new Date().toISOString();

  // 构建交互记录
  const interaction = {
    id: interactionId,
    type: 'interaction',
    interactionType,
    status: INTERACTION_STATUS.PENDING,
    question,
    description: description || '',
    options: choiceOptions || [],
    defaultValue,
    placeholder: placeholder || '',
    answer: null,
    answeredAt: null,
    phase: phase || '',
    permissionId: permissionId || '',
    createdAt: now,
    updatedAt: now,
  };

  // 添加到任务历史
  const { appendTaskHistory } = require('./task');
  appendTaskHistory(projectId, taskId, interaction);

  // 通知前端有新交互
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('interaction:pending', {
      projectId,
      taskId,
      interaction,
    });
  }

  // 返回 Promise，等待用户回答
  return new Promise((resolve, reject) => {
    // 设置超时
    const timer = setTimeout(() => {
      pendingInteractions.delete(interactionId);

      // 更新交互状态为超时
      updateInteractionStatus(projectId, taskId, interactionId, INTERACTION_STATUS.TIMEOUT);

      // 通知前端
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('interaction:timeout', {
          projectId,
          taskId,
          interactionId,
        });
      }

      reject(new Error('交互超时'));
    }, INTERACTION_TIMEOUT);

    pendingInteractions.set(interactionId, {
      resolve,
      reject,
      timer,
      projectId,
      taskId,
      proc,
    });
  });
}

/**
 * 提交交互回答
 * @param {string} projectId - 项目 ID
 * @param {string} taskId - 任务 ID
 * @param {string} interactionId - 交互 ID
 * @param {any} answer - 用户回答
 * @param {Object} mainWindow - Electron 主窗口
 */
function submitAnswer(projectId, taskId, interactionId, answer, mainWindow) {
  // 验证 answer
  if (answer !== null && answer !== undefined) {
    if (typeof answer === 'string' && answer.length > 10000) {
      throw new Error('回答内容过长');
    }
    if (typeof answer !== 'string' && typeof answer !== 'boolean' && typeof answer !== 'number') {
      // 对于对象类型，限制 JSON 序列化大小
      try {
        const serialized = JSON.stringify(answer);
        if (serialized.length > 10000) {
          throw new Error('回答内容过长');
        }
      } catch (e) {
        if (e.message === '回答内容过长') throw e;
        throw new Error('回答格式无效');
      }
    }
  }

  const pending = pendingInteractions.get(interactionId);
  if (!pending) {
    throw new Error('交互不存在或已过期');
  }

  // 先删除再处理，防止并发重复处理
  if (!pendingInteractions.delete(interactionId)) {
    throw new Error('交互已被处理');
  }

  // 清除超时定时器
  clearTimeout(pending.timer);

  // 更新交互状态
  updateInteractionStatus(projectId, taskId, interactionId, INTERACTION_STATUS.ANSWERED, answer);

  // 通知前端
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('interaction:answered', {
      projectId,
      taskId,
      interactionId,
      answer,
    });
  }

  // 解析 Promise
  pending.resolve(answer);
}

/**
 * 取消交互
 * @param {string} projectId - 项目 ID
 * @param {string} taskId - 任务 ID
 * @param {string} interactionId - 交互 ID
 * @param {Object} mainWindow - Electron 主窗口
 */
function cancelInteraction(projectId, taskId, interactionId, mainWindow) {
  const pending = pendingInteractions.get(interactionId);
  if (!pending) return;

  clearTimeout(pending.timer);
  pendingInteractions.delete(interactionId);

  updateInteractionStatus(projectId, taskId, interactionId, INTERACTION_STATUS.CANCELLED);

  // 通知前端
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('interaction:cancelled', {
      projectId,
      taskId,
      interactionId,
    });
  }

  pending.reject(new Error('交互已取消'));
}

/**
 * 清理所有等待中的交互（应用关闭时调用）
 */
function cleanup() {
  for (const [id, pending] of pendingInteractions) {
    clearTimeout(pending.timer);
    pending.reject(new Error('应用正在关闭'));
  }
  pendingInteractions.clear();
}

/**
 * 更新交互状态（内部方法）
 */
function updateInteractionStatus(projectId, taskId, interactionId, status, answer = null) {
  const { listTasks, writeTasks } = require('./task');
  const tasks = listTasks(projectId);
  const taskIndex = tasks.findIndex(t => t.id === taskId);
  if (taskIndex === -1) return;

  const task = tasks[taskIndex];
  const historyIndex = task.history.findIndex(h => h.id === interactionId);
  if (historyIndex === -1) return;

  const now = new Date().toISOString();
  task.history[historyIndex] = {
    ...task.history[historyIndex],
    status,
    answer,
    answeredAt: now,
    updatedAt: now,
  };

  // 同时添加一条回答记录
  if (status === INTERACTION_STATUS.ANSWERED) {
    task.history.unshift({
      id: uuidv4(),
      type: 'interaction_answered',
      interactionId,
      answer,
      createdAt: now,
    });
  }

  writeTasks(projectId, tasks);
}

/**
 * 获取任务中等待回答的交互
 */
function getPendingInteractions(projectId, taskId) {
  const { getTask } = require('./task');
  const task = getTask(projectId, taskId);
  if (!task) return [];

  return task.history.filter(h =>
    h.type === 'interaction' && h.status === INTERACTION_STATUS.PENDING
  );
}

/**
 * 检查是否有等待中的交互
 */
function hasPendingInteractions() {
  return pendingInteractions.size > 0;
}

/**
 * 获取所有等待中的交互数量
 */
function getPendingCount() {
  return pendingInteractions.size;
}

module.exports = {
  createInteraction,
  submitAnswer,
  cancelInteraction,
  cleanup,
  getPendingInteractions,
  hasPendingInteractions,
  getPendingCount,
  INTERACTION_TYPES,
  INTERACTION_STATUS,
};