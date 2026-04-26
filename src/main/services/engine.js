const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const { getProject, updateProject } = require('./project');
const { listTasks, updateTask, appendTaskHistory } = require('./task');
const { getAdapter, checkAllCLIs } = require('./cli-adapters');
const { ErrorHandler, VCTError, ErrorTypes } = require('./errors');
const { RetryExecutor } = require('./retry');
const {
  getAgent,
  buildAgentCommand,
  checkAgentAvailable,
  listAgents,
  getAgentWorkflow,
  WORKFLOW_PHASES,
  DEFAULT_WORKFLOW,
} = require('./agent');
const {
  createInteraction,
  submitAnswer,
  cancelInteraction,
  INTERACTION_TYPES,
} = require('./interaction');

// Active engines per project
const engines = new Map();

// Per-task session tracking: taskId -> sessionId
const taskSessions = new Map();

// Output batcher for 60fps rendering - per project
const outputBatchers = new Map();

// Progress memory buffer - avoid frequent file writes
const progressBuffers = new Map();
const PROGRESS_FLUSH_INTERVAL = 500; // ms
const progressFlushTimers = new Map();

// Error handler and retry executor
const errorHandler = new ErrorHandler();
const retryExecutor = new RetryExecutor();

class OutputBatcher {
  constructor(projectId, mainWindow, flushCallback) {
    this.projectId = projectId;
    this.mainWindow = mainWindow;
    this.flushCallback = flushCallback;
    this.buffer = '';
    this.timer = null;
    this.seq = 0;
    this.BATCH_INTERVAL = 16; // ~60fps
    this.MAX_BUFFER_SIZE = 65536; // 64KB max buffer size
  }

  append(data) {
    this.buffer += data;
    // 如果缓冲区超过最大大小，立即刷新
    if (this.buffer.length > this.MAX_BUFFER_SIZE) {
      this.flush();
      return;
    }
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.BATCH_INTERVAL);
    }
  }

  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.buffer && this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.seq += 1;
      try {
        this.mainWindow.webContents.send('terminal:data', {
          projectId: this.projectId,
          data: this.buffer,
          seq: this.seq,
          timestamp: Date.now(),
        });
        if (this.flushCallback) {
          this.flushCallback(this.buffer);
        }
      } catch (e) {
        // 忽略发送错误（窗口可能已关闭）
        console.error('OutputBatcher flush error:', e.message);
      }
      this.buffer = '';
    }
  }

  destroy() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.flush();
  }
}

// 任务类型定义
const TASK_TYPES = {
  FULL_DEVELOPMENT: 'full_development',   // 完整开发流程
  SIMPLE: 'simple',                        // 简单任务，直接执行
  ANALYSIS_ONLY: 'analysis_only',          // 仅分析
  FIX_ONLY: 'fix_only',                    // 仅修复
  CUSTOM: 'custom',                        // 自定义流程
};

// 各任务类型对应的执行阶段
const TASK_TYPE_PHASES = {
  [TASK_TYPES.FULL_DEVELOPMENT]: ['analyze', 'plan', 'develop', 'review', 'test', 'fix', 'commit'],
  [TASK_TYPES.SIMPLE]: ['execute'],
  [TASK_TYPES.ANALYSIS_ONLY]: ['analyze'],
  [TASK_TYPES.FIX_ONLY]: ['analyze', 'fix'],
  [TASK_TYPES.CUSTOM]: ['analyze', 'plan', 'develop', 'review', 'test', 'fix', 'commit'],
};

// 开发阶段定义
const PHASES = [
  { key: 'classify', name: '任务分类', executionStatus: 'analyzing' },
  { key: 'git_pull', name: '拉取最新代码', executionStatus: 'queued' },
  { key: 'analyze', name: '需求分析', executionStatus: 'analyzing' },
  { key: 'plan', name: '制定计划', executionStatus: 'planning' },
  { key: 'develop', name: '开发实现', executionStatus: 'developing' },
  { key: 'review', name: '代码审查', executionStatus: 'reviewing' },
  { key: 'test', name: '功能测试', executionStatus: 'testing' },
  { key: 'fix', name: '修复缺陷', executionStatus: 'fixing' },
  { key: 'commit', name: '提交代码', executionStatus: 'committing' },
  { key: 'execute', name: '执行任务', executionStatus: 'developing' },
];

// 有效的工作流程阶段
const VALID_WORKFLOW_PHASES = ['analyze', 'plan', 'develop', 'review', 'test', 'fix', 'commit', 'execute'];

// 验证并过滤工作流程阶段
function validateWorkflow(workflow) {
  if (!Array.isArray(workflow)) return DEFAULT_WORKFLOW;
  const valid = workflow.filter(phase => VALID_WORKFLOW_PHASES.includes(phase));
  return valid.length > 0 ? valid : DEFAULT_WORKFLOW;
}

function getProgressFilePath(projectId) {
  const project = getProject(projectId);
  if (!project) return null;
  return path.join(project.workDir, '.vct', 'progress.json');
}

function readProgress(projectId) {
  const filePath = getProgressFilePath(projectId);
  if (!filePath || !fs.existsSync(filePath)) return null;
  const progress = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return {
    projectId,
    currentTaskId: null,
    currentPhase: null,
    phaseIndex: 0,
    lastOutput: '',
    lastLogFile: null,
    lastRunAt: null,
    updatedAt: new Date().toISOString(),
    ...progress,
  };
}

function writeProgress(projectId, progress) {
  const filePath = getProgressFilePath(projectId);
  if (!filePath) return;
  progress.updatedAt = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(progress, null, 2), 'utf-8');
}

function getLogStream(projectId) {
  const project = getProject(projectId);
  if (!project) return null;
  const logDir = path.join(project.workDir, '.vct', 'logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFile = path.join(logDir, `${timestamp}.log`);
  const progress = readProgress(projectId) || { projectId };
  writeProgress(projectId, { ...progress, lastLogFile: logFile, lastRunAt: new Date().toISOString() });
  return {
    logFile,
    stream: fs.createWriteStream(logFile, { flags: 'a' }),
  };
}

function emitTerminalData(mainWindow, projectId, data) {
  // Use batcher for efficient 60fps rendering
  let batcher = outputBatchers.get(projectId);
  if (!batcher) {
    batcher = new OutputBatcher(projectId, mainWindow, (chunk) => {
      appendProgressBuffer(projectId, chunk);
    });
    outputBatchers.set(projectId, batcher);
  }
  batcher.append(data);
}

function emitTerminalDataImmediate(mainWindow, projectId, data) {
  // For critical messages that need immediate display (like phase headers)
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('terminal:data', {
      projectId,
      data,
      seq: 0,
      timestamp: Date.now(),
      immediate: true,
    });
  }
  appendProgressBuffer(projectId, data);
}

function addHistory(projectId, taskId, entry) {
  if (!taskId) return;
  appendTaskHistory(projectId, taskId, entry);
}

function runLocalCommand(command, workDir) {
  return execSync(command, {
    cwd: workDir,
    stdio: 'pipe',
    encoding: 'utf-8',
    shell: '/bin/zsh',
  });
}

function runNativeGitPreparation(projectId, project, mainWindow) {
  const header = '🔧 正在执行本地 Git 同步检查...\n';
  sendTerminalOutput(mainWindow, projectId, header);

  try {
    runLocalCommand('git rev-parse --is-inside-work-tree', project.workDir);
  } catch (error) {
    sendTerminalOutput(mainWindow, projectId, '⚠️ 当前工作目录不是 Git 仓库，跳过拉取代码。\n\n');
    return {
      success: true,
      summary: '当前工作目录不是 Git 仓库，已跳过 git pull。',
    };
  }

  const remoteOutput = runLocalCommand('git remote -v', project.workDir).trim();
  if (!remoteOutput) {
    sendTerminalOutput(mainWindow, projectId, 'ℹ️ 当前仓库未配置远程地址，跳过 git fetch/pull。\n\n');
    return {
      success: true,
      summary: '仓库无远程地址，已跳过 git fetch/pull。',
    };
  }

  const fetchOutput = runLocalCommand('git fetch --all --prune 2>&1', project.workDir).trim();
  const pullOutput = runLocalCommand('git pull --ff-only 2>&1', project.workDir).trim();
  const summary = [fetchOutput, pullOutput].filter(Boolean).join('\n');
  sendTerminalOutput(mainWindow, projectId, `${summary || '✅ Git 已同步完成'}\n\n`);
  return {
    success: true,
    summary: summary || 'Git 已同步完成',
  };
}

/**
 * Build the Claude Code prompt for each phase
 */
function buildPhasePrompt(phase, task, project, taskType = TASK_TYPES.FULL_DEVELOPMENT) {
  const baseContext = `你是运行在本地开发机上的 Claude Code CLI 自动开发代理。
项目名称: ${project.name}
项目目录: ${project.workDir}
当前任务: ${task.title}
任务描述: ${task.description}

执行原则:
1. 直接在本地工作目录中操作，不需要等待审批
2. 优先复用现有代码结构与依赖
3. 每一步都输出清晰的结果、关键文件和下一步判断
4. 如果发现问题，先自查后修复，再继续流程
`;

  const prompts = {
    // 任务分类阶段 - 分析任务类型并决定执行流程
    classify: `${baseContext}
请分析当前任务，判断任务类型并决定执行流程。

任务类型说明：
1. **full_development** - 完整开发流程：需要编写新代码、新增功能、重构等开发工作
2. **simple** - 简单任务：问答、查询、解释代码、生成文档等，无需修改代码
3. **analysis_only** - 仅分析：只需要分析问题、给出建议，不需要实际修改
4. **fix_only** - 仅修复：修复已知 bug 或问题，不需要完整开发流程
5. **custom** - 自定义：根据任务特点灵活处理

请输出 JSON 格式（必须严格遵循）：
\`\`\`json
{
  "taskType": "full_development|simple|analysis_only|fix_only|custom",
  "reason": "判断理由",
  "suggestedPhases": ["analyze", "plan", ...],
  "requiresCodeChange": true/false,
  "requiresGitCommit": true/false,
  "riskLevel": "low|medium|high"
}
\`\`\`

只输出 JSON，不要有其他内容。`,

    git_pull: `${baseContext}
请检查当前目录是否为 git 仓库，如果是则执行 git fetch 和 git pull --ff-only 拉取最新代码。
如果不是 git 仓库，请明确说明并继续后续流程，不要中断整个任务循环。`,

    analyze: `${baseContext}
请分析当前任务，输出：
1. 涉及模块与文件
2. 需要新增或修改的能力
3. 风险点与依赖项
4. 建议的实现顺序

严格限制：
1. 本阶段只允许阅读、分析、总结
2. 严禁修改任何文件
3. 严禁执行 git add / git commit / git push
4. 严禁把实现工作提前到当前阶段

请结合实际代码库，不要给空泛建议。`,

    plan: `${baseContext}
基于下面的分析结果制定开发计划：
${task.analysis || task.description}

严格限制：
1. 本阶段只输出计划
2. 严禁修改任何文件
3. 严禁执行 git add / git commit / git push

请给出可执行的分步计划，明确每步目标、涉及文件和验收点。`,

    develop: `${baseContext}
请按照下面的计划直接完成实现：
${task.plan || '请根据任务描述完成实现'}

要求：
1. 做真实代码修改而不是只给建议
2. 保持和现有项目风格一致
3. 为关键错误路径补齐处理
4. 本阶段不要提交 git commit 或 git push
5. 完成后说明修改了哪些文件`,

    review: `${baseContext}
请以代码审查视角检查刚完成的修改：
1. 功能正确性
2. 回归风险
3. 异常处理
4. 可维护性

严格限制：
1. 本阶段只审查和记录
2. 不要修改文件
3. 不要提交 git commit 或 git push

如果发现问题，请只记录问题和建议，不要在本阶段直接修复。`,

    test: `${baseContext}
请验证当前功能：
1. 优先运行项目已有测试
2. 如果没有测试框架，执行必要的构建、静态检查或手动验证
3. 覆盖前端界面、服务接口和核心流程

严格限制：
1. 本阶段只做验证和记录
2. 不要修改业务代码
3. 不要提交 git commit 或 git push

请输出测试过程、结果和未覆盖风险。`,

    fix: `${baseContext}
根据以下测试与审查结果修复问题，并补做必要验证：
${task.testResult || task.reviewResult || '请检查当前实现中的问题并修复'}

严格限制：
1. 可以修改文件修复问题
2. 不要在本阶段提交 git commit 或 git push

请说明修复点和复测结果。`,

    commit: `${baseContext}
请在确认当前工作可提交后：
1. 查看 git 状态
2. git add 相关修改
3. 使用提交信息 "feat: ${task.title}" 创建提交
4. 如果已配置远程且推送安全，执行 git push

请返回 commit hash 和提交摘要。`,

    // 简单任务执行阶段 - 直接完成任务
    execute: `${baseContext}
请直接完成当前任务。

要求：
1. 根据任务描述直接执行，无需遵循开发流程
2. 如果需要修改代码，完成后说明修改内容
3. 如果只是问答或分析，直接给出结果
4. 输出清晰的执行结果

完成后说明任务执行情况。`,
  };

  return prompts[phase] || baseContext;
}

/**
 * 解析任务分类结果
 * @param {string} output - CLI 输出
 * @returns {Object} 分类结果
 */
function parseTaskClassification(output) {
  try {
    // 尝试从输出中提取 JSON
    const jsonMatch = output.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    // 尝试直接解析整个输出
    const trimmed = output.trim();
    if (trimmed.startsWith('{')) {
      return JSON.parse(trimmed);
    }
  } catch (e) {
    console.error('Failed to parse task classification:', e.message);
  }

  // 默认返回完整开发流程
  return {
    taskType: TASK_TYPES.FULL_DEVELOPMENT,
    reason: '无法解析分类结果，使用默认完整流程',
    suggestedPhases: TASK_TYPE_PHASES[TASK_TYPES.FULL_DEVELOPMENT],
    requiresCodeChange: true,
    requiresGitCommit: true,
    riskLevel: 'medium',
  };
}

/**
 * 处理权限请求提示 - 交互式权限确认
 * @param {Object} event - 权限请求事件
 * @param {Object} proc - CLI 进程实例
 * @param {string} projectId - 项目 ID
 * @param {string} taskId - 任务 ID
 * @param {Object} mainWindow - Electron 主窗口
 */
async function handlePermissionPrompt(event, proc, projectId, taskId, mainWindow) {
  // 发送提示信息到终端
  sendTerminalOutput(mainWindow, projectId, `\n⏳ 需要用户确认: ${event.message}\n`);

  try {
    // 确定交互类型
    let interactionType = INTERACTION_TYPES.CONFIRM;
    if (event.options && event.options.length > 2) {
      interactionType = INTERACTION_TYPES.CHOICE;
    }

    // 创建交互请求并等待用户响应
    const answer = await createInteraction({
      projectId,
      taskId,
      interactionType,
      question: event.message || '是否允许执行此操作？',
      description: event.resource ? `资源: ${event.resource}\n操作: ${event.action || ''}` : '',
      options: event.options || [
        { label: '允许', value: 'allow', description: '执行此操作' },
        { label: '拒绝', value: 'deny', description: '取消此操作' },
      ],
      phase: getCurrentPhase(projectId),
      permissionId: event.permissionId,
    }, mainWindow, proc);

    // 将用户回答写入 CLI stdin
    const response = formatPermissionResponse(event, answer);
    proc.stdin.write(JSON.stringify(response) + '\n');

    sendTerminalOutput(mainWindow, projectId, `✅ 用户已响应: ${answer}\n`);
  } catch (e) {
    // 用户取消或超时，发送拒绝响应
    try {
      proc.stdin.write(JSON.stringify({ action: 'deny' }) + '\n');
    } catch (writeError) {
      // 进程可能已关闭
    }
    sendTerminalOutput(mainWindow, projectId, `❌ 交互已取消: ${e.message}\n`);
  }
}

/**
 * 获取当前执行阶段
 */
function getCurrentPhase(projectId) {
  const progress = readProgress(projectId);
  return progress?.currentPhase || '';
}

/**
 * 格式化权限响应
 */
function formatPermissionResponse(event, answer) {
  if (typeof answer === 'string') {
    return { action: answer };
  }
  return { action: 'allow', value: answer };
}

/**
 * Run a single CLI command using the adapter pattern
 * @param {string} projectId - Project ID
 * @param {string} prompt - User prompt
 * @param {string} workDir - Working directory
 * @param {Object} mainWindow - Electron main window
 * @param {string} sessionId - Session ID for resume
 * @param {string} agentType - CLI agent type (claude-code, opencode)
 * @param {string} taskId - Task ID for interaction tracking
 * @param {boolean} interactive - Enable interactive mode
 * @returns {Promise} Execution result
 */
function runCLICommand(projectId, prompt, workDir, mainWindow, sessionId, agentType = 'claude-code', taskId = null, interactive = false) {
  return new Promise(async (resolve, reject) => {
    // Get the appropriate adapter
    let adapter;
    try {
      adapter = getAdapter(agentType);
    } catch (e) {
      return reject(new VCTError(
        ErrorTypes.CLI_NOT_INSTALLED,
        `不支持的 CLI 类型: ${agentType}`,
        { recoverable: false, context: { cliName: agentType } }
      ));
    }

    // Check if CLI is installed
    try {
      execSync(`which ${adapter.executable}`, { timeout: 5000 });
    } catch (e) {
      return reject(new VCTError(
        ErrorTypes.CLI_NOT_INSTALLED,
        `${adapter.displayName} CLI 未安装`,
        { recoverable: false, context: { cliName: adapter.displayName } }
      ));
    }

    const { stream: logStream } = getLogStream(projectId);

    // Build command args using adapter
    const args = adapter.buildCommandArgs({
      prompt,
      workDir,
      sessionId,
      maxTurns: 30,
      interactive,
    });

    // Spawn process
    const proc = spawn(adapter.executable, args, {
      cwd: workDir,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let buffer = '';
    let finalResult = '';
    let fallbackResult = '';
    let capturedSessionId = sessionId || null;

    function handleStdoutChunk(text) {
      stdout += text;
      buffer += text;
      logStream.write(text);

      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line) {
          const event = adapter.parseOutputLine(line);

          // Extract session ID
          if (event.type === 'session' && event.sessionId) {
            capturedSessionId = event.sessionId;
          }

          // Handle permission prompts - 交互式权限请求 (runCLICommand)
          if (event.type === 'permission_prompt' && interactive && taskId) {
            handlePermissionPrompt(event, proc, projectId, taskId, mainWindow).catch(err => {
              console.error('Permission prompt handling failed:', err);
              // 发送拒绝响应避免 CLI 挂起
              try {
                if (proc.stdin && !proc.stdin.destroyed && proc.stdin.writable) {
                  proc.stdin.write(JSON.stringify({ action: 'deny' }) + '\n');
                }
              } catch (e) {}
            });
          }

          // Extract printable text
          const printable = adapter.extractPrintableText(event);
          if (printable) {
            finalResult += printable;
            emitTerminalData(mainWindow, projectId, printable);
          }

          // Fallback result for Claude Code format
          if (event.type === 'result_content' && event.text) {
            fallbackResult = event.text;
          }
        }
        newlineIndex = buffer.indexOf('\n');
      }
    }

    proc.stdout.on('data', (data) => {
      handleStdoutChunk(data.toString());
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      logStream.write(text);
      emitTerminalData(mainWindow, projectId, text);
    });

    proc.on('close', (code) => {
      logStream.end();

      // Handle remaining buffer
      if (buffer.trim()) {
        const event = adapter.parseOutputLine(buffer.trim());
        const printable = adapter.extractPrintableText(event);
        if (printable) finalResult += printable;
      }

      // Check if process was killed intentionally (engine stopping)
      const engineState = engines.get(projectId);
      const wasIntentionalStop = engineState?.stopping;

      if (code === 0) {
        resolve({
          success: true,
          output: finalResult.trim() || fallbackResult.trim() || stdout,
          fullOutput: stdout,
          sessionId: capturedSessionId,
        });
      } else if (wasIntentionalStop) {
        // Process was killed intentionally (user clicked pause)
        // Resolve gracefully instead of rejecting
        resolve({
          success: false,
          stopped: true,
          output: finalResult.trim() || fallbackResult.trim() || stdout,
          fullOutput: stdout,
          sessionId: capturedSessionId,
        });
      } else {
        const formattedError = adapter.formatError(stderr);
        reject(new VCTError(
          ErrorTypes.CLI_PROCESS_ERROR,
          `${adapter.displayName} 退出码 ${code}: ${formattedError}`,
          { context: { exitCode: code, stderr, cliName: adapter.displayName } }
        ));
      }
    });

    proc.on('error', (err) => {
      logStream.end();
      reject(new VCTError(
        ErrorTypes.CLI_PROCESS_ERROR,
        `进程启动失败: ${err.message}`,
        { originalError: err }
      ));
    });

    // Store the process so we can kill it on pause
    if (engines.has(projectId)) {
      engines.get(projectId).currentProcess = proc;
    }
  });
}

/**
 * Execute CLI command with retry support
 */
async function executeWithRetry(projectId, prompt, workDir, mainWindow, sessionId, agentType, taskId = null, interactive = false) {
  return retryExecutor.execute(
    () => runCLICommand(projectId, prompt, workDir, mainWindow, sessionId, agentType, taskId, interactive),
    (error, attempt) => {
      // Don't retry for CLI not installed or auth failed
      if (error.type === ErrorTypes.CLI_NOT_INSTALLED) return false;
      if (error.type === ErrorTypes.CLI_AUTH_FAILED) return false;
      return true;
    },
    (error, attempt, delay) => {
      sendTerminalOutput(mainWindow, projectId, `⏳ 第 ${attempt} 次重试，${delay / 1000} 秒后执行...\n`);
    }
  );
}

/**
 * Run a command using an Agent (custom configured CLI)
 * @param {string} projectId - Project ID
 * @param {string} agentId - Agent ID
 * @param {string} prompt - User prompt
 * @param {string} workDir - Working directory
 * @param {Object} mainWindow - Electron main window
 * @param {string} sessionId - Session ID for resume
 * @param {string} taskId - Task ID for interaction tracking
 * @param {boolean} interactive - Enable interactive mode
 * @returns {Promise} Execution result
 */
function runAgentCommand(projectId, agentId, prompt, workDir, mainWindow, sessionId, taskId = null, interactive = false) {
  return new Promise(async (resolve, reject) => {
    // Get agent configuration and build command
    let commandConfig;
    try {
      commandConfig = buildAgentCommand(agentId, {
        prompt,
        workDir,
        sessionId,
      });
    } catch (e) {
      return reject(new VCTError(
        ErrorTypes.CLI_NOT_INSTALLED,
        `Agent 配置错误: ${e.message}`,
        { recoverable: false, context: { agentId } }
      ));
    }

    const { executable, args, env, adapter, agent, hasCustomConfig } = commandConfig;

    // Check if CLI is installed
    try {
      execSync(`which ${executable}`, { timeout: 5000 });
    } catch (e) {
      return reject(new VCTError(
        ErrorTypes.CLI_NOT_INSTALLED,
        `${adapter.displayName} CLI 未安装`,
        { recoverable: false, context: { cliName: adapter.displayName } }
      ));
    }

    const { stream: logStream } = getLogStream(projectId);

    // Log agent info
    logStream.write(`[Agent: ${agent.name}] Using ${adapter.displayName}\n`);
    if (hasCustomConfig) {
      logStream.write(`[Config] 使用自定义 API 配置\n`);
      if (agent.model) logStream.write(`[Model] ${agent.model}\n`);
      if (agent.apiBaseUrl) logStream.write(`[API URL] ${agent.apiBaseUrl}\n`);
    } else {
      logStream.write(`[Config] 使用 CLI 默认配置\n`);
    }
    if (agent.systemPrompt) {
      logStream.write(`[System Prompt] 已配置 (${agent.systemPrompt.length} 字符)\n`);
    }
    logStream.write(`[Command] ${executable} ${args.slice(0, 5).join(' ')}...\n`);

    // Spawn process with agent's environment
    const proc = spawn(executable, args, {
      cwd: workDir,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let buffer = '';
    let finalResult = '';
    let fallbackResult = '';
    let capturedSessionId = sessionId || null;

    function handleStdoutChunk(text) {
      stdout += text;
      buffer += text;
      logStream.write(text);

      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line) {
          const event = adapter.parseOutputLine(line);

          // Extract session ID
          if (event.type === 'session' && event.sessionId) {
            capturedSessionId = event.sessionId;
          }

          // Handle permission prompts - 交互式权限请求 (runCLICommand)
          if (event.type === 'permission_prompt' && interactive && taskId) {
            handlePermissionPrompt(event, proc, projectId, taskId, mainWindow).catch(err => {
              console.error('Permission prompt handling failed:', err);
              // 发送拒绝响应避免 CLI 挂起
              try {
                if (proc.stdin && !proc.stdin.destroyed && proc.stdin.writable) {
                  proc.stdin.write(JSON.stringify({ action: 'deny' }) + '\n');
                }
              } catch (e) {}
            });
          }

          // Extract printable text
          const printable = adapter.extractPrintableText(event);
          if (printable) {
            finalResult += printable;
            emitTerminalData(mainWindow, projectId, printable);
          }

          // Fallback result for Claude Code format
          if (event.type === 'result_content' && event.text) {
            fallbackResult = event.text;
          }
        }
        newlineIndex = buffer.indexOf('\n');
      }
    }

    proc.stdout.on('data', (data) => {
      handleStdoutChunk(data.toString());
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      logStream.write(text);
      emitTerminalData(mainWindow, projectId, text);
    });

    proc.on('close', (code) => {
      logStream.end();

      // Handle remaining buffer
      if (buffer.trim()) {
        const event = adapter.parseOutputLine(buffer.trim());
        const printable = adapter.extractPrintableText(event);
        if (printable) finalResult += printable;
      }

      // Check if process was killed intentionally (engine stopping)
      const engineState = engines.get(projectId);
      const wasIntentionalStop = engineState?.stopping;

      if (code === 0) {
        resolve({
          success: true,
          output: finalResult.trim() || fallbackResult.trim() || stdout,
          fullOutput: stdout,
          sessionId: capturedSessionId,
        });
      } else if (wasIntentionalStop) {
        // Process was killed intentionally (user clicked pause)
        // Resolve gracefully instead of rejecting
        resolve({
          success: false,
          stopped: true,
          output: finalResult.trim() || fallbackResult.trim() || stdout,
          fullOutput: stdout,
          sessionId: capturedSessionId,
        });
      } else {
        const formattedError = adapter.formatError(stderr);
        reject(new VCTError(
          ErrorTypes.CLI_PROCESS_ERROR,
          `${agent.name} (${adapter.displayName}) 退出码 ${code}: ${formattedError}`,
          { context: { exitCode: code, stderr, cliName: adapter.displayName, agentName: agent.name } }
        ));
      }
    });

    proc.on('error', (err) => {
      logStream.end();
      reject(new VCTError(
        ErrorTypes.CLI_PROCESS_ERROR,
        `进程启动失败: ${err.message}`,
        { originalError: err }
      ));
    });

    // Store the process so we can kill it on pause
    if (engines.has(projectId)) {
      engines.get(projectId).currentProcess = proc;
    }
  });
}

/**
 * Execute Agent command with retry support
 */
async function executeAgentWithRetry(projectId, agentId, prompt, workDir, mainWindow, sessionId, taskId = null, interactive = false) {
  return retryExecutor.execute(
    () => runAgentCommand(projectId, agentId, prompt, workDir, mainWindow, sessionId, taskId, interactive),
    (error, attempt) => {
      // Don't retry for CLI not installed or auth failed
      if (error.type === ErrorTypes.CLI_NOT_INSTALLED) return false;
      if (error.type === ErrorTypes.CLI_AUTH_FAILED) return false;
      return true;
    },
    (error, attempt, delay) => {
      sendTerminalOutput(mainWindow, projectId, `⏳ 第 ${attempt} 次重试，${delay / 1000} 秒后执行...\n`);
    }
  );
}

/**
 * Run a single Claude Code command in print mode (legacy compatibility)
 * @deprecated Use runCLICommand instead
 */
function runClaudeCommand(projectId, prompt, workDir, mainWindow, sessionId) {
  return runCLICommand(projectId, prompt, workDir, mainWindow, sessionId, 'claude-code');
}

function extractPrintableText(event) {
  if (!event || typeof event !== 'object') return '';

  // Stream text delta - main output path
  if (event.type === 'stream_event' && event.event?.type === 'content_block_delta') {
    const delta = event.event.delta;
    if (delta?.type === 'text_delta') {
      return delta.text || '';
    }
    // Tool use input delta - show tool name and parameters
    if (delta?.type === 'input_json_delta' && delta.partial_json) {
      return ''; // Skip partial JSON, too noisy
    }
  }

  // Tool use start - show which tool is being used
  if (event.type === 'stream_event' && event.event?.type === 'content_block_start') {
    const block = event.event.content_block;
    if (block?.type === 'tool_use') {
      return `\n🔧 使用工具: ${block.name}\n`;
    }
  }

  // System status messages
  if (event.type === 'system' && event.subtype === 'status' && event.status) {
    return `\n[Claude 状态] ${event.status}\n`;
  }
  if (event.type === 'system' && event.subtype === 'api_retry') {
    return `[Claude 重试] 第 ${event.attempt}/${event.max_retries} 次，${event.retry_delay_ms}ms 后重试\n`;
  }

  // Result messages
  if (event.type === 'result' && event.subtype === 'success') {
    return '\n✅ 任务执行完成\n';
  }
  if (event.type === 'result' && event.subtype === 'error') {
    return `\n❌ 错误: ${event.error || '未知错误'}\n`;
  }

  // Permission prompts (shouldn't happen with bypassPermissions, but just in case)
  if (event.type === 'system' && event.subtype === 'permission_prompt') {
    return `\n⚠️ 权限请求: ${event.message || ''}\n`;
  }

  return '';
}

function flattenContent(content) {
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

/**
 * Main engine loop - runs the full development cycle for each task
 */
async function runEngineLoop(projectId, mainWindow) {
  const project = getProject(projectId);
  if (!project) throw new Error('Project not found');

  const engine = engines.get(projectId);
  if (!engine || engine.stopping) return;

  // Get the project's default CLI agent type (fallback)
  const defaultAgentType = project.agent || 'claude-code';

  // Clear terminal for new session
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('terminal:clear', { projectId });
  }

  // Step 1: Git pull
  const initialProgress = readProgress(projectId);
  if (!initialProgress.currentTaskId) {
    try {
      runNativeGitPreparation(projectId, project, mainWindow);
    } catch (e) {
      sendTerminalOutput(mainWindow, projectId, `⚠️ 代码拉取失败: ${e.message}\n继续执行...\n\n`);
    }
  }

  // Step 2: Find next task to work on
  while (!engine.stopping) {
    const loopProgress = readProgress(projectId);
    const tasks = listTasks(projectId);
    const resumableTask = loopProgress.currentTaskId
      ? tasks.find((task) => task.id === loopProgress.currentTaskId)
      : null;
    const nextTask = resumableTask || tasks.find(t => t.boardStatus !== 'done' && t.boardStatus !== 'blocked' && t.boardStatus !== 'suspended') || null;

    if (!nextTask) {
      sendTerminalOutput(mainWindow, projectId, '🎉 当前没有可继续执行的任务，项目进入空闲状态。\n');
      updateProject(projectId, { status: 'idle' });
      notifyStatusChange(mainWindow, projectId, 'idle');
      break;
    }

    // Determine which Agent to use for this task
    let taskAgentId = nextTask.agentId;
    let taskAgent = null;
    let useAgentMode = false;

    if (taskAgentId) {
      // Task has a specific Agent assigned
      taskAgent = getAgent(taskAgentId);
      if (taskAgent && taskAgent.enabled) {
        useAgentMode = true;
        sendTerminalOutput(mainWindow, projectId, `🤖 任务使用 Agent: ${taskAgent.name}\n`);
      } else {
        sendTerminalOutput(mainWindow, projectId, `⚠️ 任务指定的 Agent ${taskAgentId} 不可用，使用项目默认 CLI\n`);
        taskAgentId = null;
      }
    }

    // If no Agent assigned, use project's default CLI type
    if (!useAgentMode) {
      const adapter = getAdapter(defaultAgentType);
      sendTerminalOutput(mainWindow, projectId, `🤖 使用 ${adapter.displayName} 执行任务\n`);
    }

    sendTerminalOutput(mainWindow, projectId, `\n${'='.repeat(60)}\n📋 开始处理任务: ${nextTask.title}\n${'='.repeat(60)}\n\n`);

    // Update progress
    const currentProgress = readProgress(projectId);
    writeProgress(projectId, {
      ...currentProgress,
      currentTaskId: nextTask.id,
      currentPhase: currentProgress.currentTaskId === nextTask.id && currentProgress.currentPhase
        ? currentProgress.currentPhase
        : 'classify',
      phaseIndex: currentProgress.currentTaskId === nextTask.id && typeof currentProgress.phaseIndex === 'number'
        ? currentProgress.phaseIndex
        : 0,
    });

    if (nextTask.boardStatus === 'todo') {
      updateTask(projectId, nextTask.id, { boardStatus: 'in_progress' });
    }

    let taskSessionId = nextTask.sessionId || taskSessions.get(nextTask.id) || null;
    addHistory(projectId, nextTask.id, {
      type: 'task_started',
      title: '开始执行任务',
      content: `引擎开始处理任务，工作目录：${project.workDir}`,
    });

    let taskFailed = false;
    let taskType = TASK_TYPES.FULL_DEVELOPMENT;
    let executionPhases = TASK_TYPE_PHASES[TASK_TYPES.FULL_DEVELOPMENT];
    let hasCodeChanges = false; // 标记是否有代码变更

    // 判断是否使用自定义 Agent 的工作流程
    const useCustomWorkflow = useAgentMode && taskAgent && taskAgent.useCustomWorkflow;

    if (useCustomWorkflow) {
      // 自定义 Agent 使用自己的工作流程，跳过任务分类
      executionPhases = validateWorkflow(getAgentWorkflow(taskAgent));
      taskType = TASK_TYPES.CUSTOM;
      sendTerminalOutput(mainWindow, projectId, `📋 Agent 使用自定义工作流程: ${executionPhases.join(' → ')}\n`);
      if (taskAgent.autoCommit) {
        sendTerminalOutput(mainWindow, projectId, `📝 配置为自动提交代码变更\n`);
      }
    } else {
      // Step 1: 任务分类 - 判断任务类型并决定执行流程
      // 如果是恢复的任务，跳过分类阶段（已有分类结果）
      if (!resumableTask || !nextTask.taskType) {
        sendTerminalOutput(mainWindow, projectId, `\n▶ 阶段 1: 任务分类\n`);
        updateTask(projectId, nextTask.id, { executionStatus: 'analyzing' });

        const classifyPrompt = buildPhasePrompt('classify', nextTask, project);
        try {
          let classifyResult;
          if (useAgentMode && taskAgentId) {
            classifyResult = await executeAgentWithRetry(
              projectId,
              taskAgentId,
              classifyPrompt,
              project.workDir,
              mainWindow,
              taskSessionId,
              nextTask.id,
              false // 分类阶段不需要交互
            );
          } else {
            classifyResult = await executeWithRetry(
              projectId,
              classifyPrompt,
              project.workDir,
              mainWindow,
              taskSessionId,
              defaultAgentType,
              nextTask.id,
              false // 分类阶段不需要交互
            );
          }

          if (classifyResult.sessionId) {
            taskSessionId = classifyResult.sessionId;
            taskSessions.set(nextTask.id, taskSessionId);
          }

          // 解析分类结果
          const classification = parseTaskClassification(classifyResult.output);
          taskType = classification.taskType || TASK_TYPES.FULL_DEVELOPMENT;
          executionPhases = classification.suggestedPhases || TASK_TYPE_PHASES[taskType];

          // 保存分类结果到任务
          updateTask(projectId, nextTask.id, {
            taskType,
            taskClassification: JSON.stringify(classification),
          });

          sendTerminalOutput(mainWindow, projectId, `\n📊 任务分类结果: ${taskType}\n`);
          sendTerminalOutput(mainWindow, projectId, `📝 理由: ${classification.reason}\n`);
          sendTerminalOutput(mainWindow, projectId, `🔄 执行阶段: ${executionPhases.join(' → ')}\n`);
          sendTerminalOutput(mainWindow, projectId, `✅ 分类完成\n\n`);

          addHistory(projectId, nextTask.id, {
            type: 'task_classified',
            title: '任务分类完成',
            content: `类型: ${taskType}, 执行阶段: ${executionPhases.join(',')}`,
          });

        } catch (e) {
          sendTerminalOutput(mainWindow, projectId, `⚠️ 任务分类失败，使用默认完整流程: ${e.message}\n`);
          taskType = TASK_TYPES.FULL_DEVELOPMENT;
          executionPhases = TASK_TYPE_PHASES[TASK_TYPES.FULL_DEVELOPMENT];
        }
      } else {
        // 恢复任务，使用已有的分类结果
        taskType = nextTask.taskType || TASK_TYPES.FULL_DEVELOPMENT;
        try {
          const savedClassification = nextTask.taskClassification
            ? JSON.parse(nextTask.taskClassification)
            : null;
          executionPhases = savedClassification?.suggestedPhases || TASK_TYPE_PHASES[taskType];
        } catch (e) {
          executionPhases = TASK_TYPE_PHASES[taskType];
        }
        sendTerminalOutput(mainWindow, projectId, `📊 恢复任务，类型: ${taskType}\n`);
        sendTerminalOutput(mainWindow, projectId, `🔄 执行阶段: ${executionPhases.join(' → ')}\n\n`);
      }
    }

    // Step 2: 按分类后的阶段执行任务
    for (let phaseIdx = 0; phaseIdx < executionPhases.length; phaseIdx++) {
      if (engine.stopping) break;

      const phaseKey = executionPhases[phaseIdx];
      const phase = PHASES.find(p => p.key === phaseKey);
      if (!phase) {
        sendTerminalOutput(mainWindow, projectId, `⚠️ 未知的阶段: ${phaseKey}, 跳过\n`);
        continue;
      }

      sendTerminalOutput(mainWindow, projectId, `\n▶ 阶段 ${phaseIdx + 1}/${executionPhases.length}: ${phase.name}\n`);
      addHistory(projectId, nextTask.id, {
        type: 'phase_started',
        phase: phase.key,
        title: `${phase.name}开始`,
        content: `开始执行阶段：${phase.name}`,
      });

      // Update task status
      updateTask(projectId, nextTask.id, {
        executionStatus: phase.executionStatus,
        lastError: '',
      });

      // Notify task status change
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('task:status-change', {
          projectId,
          taskId: nextTask.id,
          status: phase.executionStatus,
        });
      }

      // Update progress
      writeProgress(projectId, {
        ...readProgress(projectId),
        currentPhase: phase.key,
        phaseIndex: phaseIdx,
      });

      // Build and execute prompt
      const prompt = buildPhasePrompt(phase.key, nextTask, project, taskType);

      // 判断是否启用交互模式（开发、修复、提交阶段需要交互）
      const interactivePhases = ['develop', 'fix', 'commit'];
      const enableInteractive = interactivePhases.includes(phase.key);

      try {
        // Execute with Agent or default CLI based on task configuration
        let result;
        if (useAgentMode && taskAgentId) {
          // Use Agent for this task
          result = await executeAgentWithRetry(
            projectId,
            taskAgentId,
            prompt,
            project.workDir,
            mainWindow,
            taskSessionId,
            nextTask.id,
            enableInteractive
          );
        } else {
          // Use project's default CLI type
          result = await executeWithRetry(
            projectId,
            prompt,
            project.workDir,
            mainWindow,
            taskSessionId,
            defaultAgentType,
            nextTask.id,
            enableInteractive
          );
        }

        if (result.sessionId && result.sessionId !== taskSessionId) {
          taskSessionId = result.sessionId;
          taskSessions.set(nextTask.id, taskSessionId);
          updateTask(projectId, nextTask.id, { sessionId: taskSessionId });
        }

        // Store phase result in task
        const taskUpdates = {};
        if (phase.key === 'analyze') taskUpdates.analysis = result.output;
        if (phase.key === 'plan') taskUpdates.plan = result.output;
        if (phase.key === 'review') taskUpdates.reviewResult = result.output;
        if (phase.key === 'test') taskUpdates.testResult = result.output;
        if (phase.key === 'execute') taskUpdates.executionResult = result.output;
        if (phase.key === 'commit') {
          // Try to extract commit hash
          const hashMatch = result.output.match(/[0-9a-f]{7,40}/);
          if (hashMatch) taskUpdates.commitHash = hashMatch[0];
        }

        // 检测代码变更：develop、fix 和 execute 阶段可能产生代码变更
        if (phase.key === 'develop' || phase.key === 'fix' || phase.key === 'execute') {
          // 检查 git 状态判断是否有代码变更
          try {
            const gitStatus = runLocalCommand('git status --porcelain', project.workDir);
            if (gitStatus.trim()) {
              hasCodeChanges = true;
              sendTerminalOutput(mainWindow, projectId, `📝 检测到代码变更\n`);
            }
          } catch (e) {
            // 忽略 git 错误
          }
        }

        if (Object.keys(taskUpdates).length > 0) {
          updateTask(projectId, nextTask.id, taskUpdates);
        }
        addHistory(projectId, nextTask.id, {
          type: 'phase_completed',
          phase: phase.key,
          title: `${phase.name}完成`,
          content: result.output.slice(0, 4000) || `${phase.name}已完成`,
        });

        // Refresh task data for next phase prompt
        const updatedTasks = listTasks(projectId);
        const taskIndex = updatedTasks.findIndex(t => t.id === nextTask.id);
        if (taskIndex !== -1) Object.assign(nextTask, updatedTasks[taskIndex]);

        sendTerminalOutput(mainWindow, projectId, `✅ ${phase.name} 完成\n`);
      } catch (e) {
        // Use unified error handler
        const handled = errorHandler.handle(e, { projectId, phase: phase.key, phaseName: phase.name });

        sendTerminalOutput(mainWindow, projectId, `❌ ${phase.name} 失败: ${handled.message}\n`);
        updateTask(projectId, nextTask.id, {
          executionStatus: 'failed',
          lastError: handled.message,
        });
        addHistory(projectId, nextTask.id, {
          type: 'phase_failed',
          phase: phase.key,
          title: `${phase.name}失败`,
          content: handled.message,
        });
        writeProgress(projectId, {
          ...readProgress(projectId),
          currentTaskId: nextTask.id,
          currentPhase: phase.key,
          phaseIndex: phaseIdx,
        });
        taskFailed = true;
        engine.stopping = true;
        updateProject(projectId, { status: 'paused' });
        notifyStatusChange(mainWindow, projectId, 'paused');

        // Show suggestion if available
        if (handled.suggestion) {
          sendTerminalOutput(mainWindow, projectId, `💡 建议: ${handled.suggestion}\n`);
        }
        sendTerminalOutput(mainWindow, projectId, '⏸ 引擎已暂停，请修复问题后重新开始，系统会从当前任务继续。\n');
        break;
      }
    }

    // Mark task as completed
    if (!engine.stopping && !taskFailed) {
      // 自定义 Agent 且配置了自动提交，如果有代码变更则执行提交
      if (useCustomWorkflow && taskAgent && taskAgent.autoCommit && hasCodeChanges) {
        // 检查 workflow 是否已包含 commit 阶段
        const hasCommitPhase = executionPhases.includes('commit');
        if (!hasCommitPhase) {
          sendTerminalOutput(mainWindow, projectId, `\n▶ 自动执行代码提交\n`);
          updateTask(projectId, nextTask.id, { executionStatus: 'committing' });

          const commitPrompt = buildPhasePrompt('commit', nextTask, project, taskType);
          try {
            let commitResult;
            if (useAgentMode && taskAgentId) {
              commitResult = await executeAgentWithRetry(
                projectId,
                taskAgentId,
                commitPrompt,
                project.workDir,
                mainWindow,
                taskSessionId,
                nextTask.id,
                true
              );
            } else {
              commitResult = await executeWithRetry(
                projectId,
                commitPrompt,
                project.workDir,
                mainWindow,
                taskSessionId,
                defaultAgentType,
                nextTask.id,
                true
              );
            }

            // 提取 commit hash
            const hashMatch = commitResult.output.match(/[0-9a-f]{7,40}/);
            if (hashMatch) {
              updateTask(projectId, nextTask.id, { commitHash: hashMatch[0] });
              sendTerminalOutput(mainWindow, projectId, `✅ 代码已提交: ${hashMatch[0]}\n`);
            }
            addHistory(projectId, nextTask.id, {
              type: 'auto_commit',
              title: '自动提交完成',
              content: commitResult.output.slice(0, 1000),
            });
          } catch (e) {
            sendTerminalOutput(mainWindow, projectId, `⚠️ 自动提交失败: ${e.message}\n`);
          }
        }
      }

      const refreshedTask = listTasks(projectId).find((task) => task.id === nextTask.id);
      if (refreshedTask && refreshedTask.executionStatus !== 'failed') {
        updateTask(projectId, nextTask.id, {
          boardStatus: 'done',
          executionStatus: 'completed',
        });
        addHistory(projectId, nextTask.id, {
          type: 'task_completed',
          title: '任务已完成',
          content: refreshedTask.commitHash
            ? `任务已完成，提交记录：${refreshedTask.commitHash}`
            : '任务所有阶段已完成',
        });
      }
      sendTerminalOutput(mainWindow, projectId, `\n✅ 任务 "${nextTask.title}" 已完成!\n\n`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('task:status-change', {
          projectId,
          taskId: nextTask.id,
          status: 'completed',
        });
      }
    }

    // Clear current task from progress and session cache
    if (!taskFailed) {
      taskSessions.delete(nextTask.id);
      writeProgress(projectId, {
        ...readProgress(projectId),
        currentTaskId: null,
        currentPhase: null,
        phaseIndex: 0,
      });
    }
  }

  // Clean up
  engines.delete(projectId);
}

function sendTerminalOutput(mainWindow, projectId, text) {
  // For engine-generated formatted output (phase headers, etc.)
  // Use immediate mode for important markers
  emitTerminalDataImmediate(mainWindow, projectId, text);
}

function notifyStatusChange(mainWindow, projectId, status) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('engine:status-change', {
      projectId,
      status,
      timestamp: Date.now(),
    });
  }
}

function appendProgressBuffer(projectId, text) {
  // Append to memory buffer first, flush periodically
  let buffer = progressBuffers.get(projectId);
  if (!buffer) {
    buffer = { content: '', lastFlush: Date.now() };
    progressBuffers.set(projectId, buffer);
  }
  buffer.content += text;

  // Schedule flush if not already scheduled
  if (!progressFlushTimers.has(projectId)) {
    const timer = setTimeout(() => flushProgressBuffer(projectId), PROGRESS_FLUSH_INTERVAL);
    progressFlushTimers.set(projectId, timer);
  }
}

function flushProgressBuffer(projectId) {
  const buffer = progressBuffers.get(projectId);
  if (!buffer || !buffer.content) {
    progressFlushTimers.delete(projectId);
    return;
  }

  const progress = readProgress(projectId);
  if (progress) {
    const mergedOutput = `${progress.lastOutput || ''}${buffer.content}`;
    writeProgress(projectId, {
      ...progress,
      lastOutput: mergedOutput.slice(-16000), // Increased buffer size for better history
    });
    buffer.content = '';
    buffer.lastFlush = Date.now();
  }

  progressFlushTimers.delete(projectId);
}

function forceFlushAllProgressBuffers() {
  for (const [projectId] of progressBuffers) {
    if (progressFlushTimers.has(projectId)) {
      clearTimeout(progressFlushTimers.get(projectId));
      progressFlushTimers.delete(projectId);
    }
    flushProgressBuffer(projectId);
  }
}

// Backward compatibility alias
function appendProgressOutput(projectId, text) {
  appendProgressBuffer(projectId, text);
}

/**
 * Start a project's auto-development engine
 */
async function startProject(projectId, mainWindow) {
  const project = getProject(projectId);
  if (!project) return { success: false, error: 'Project not found' };

  // Check if already running
  if (engines.has(projectId)) {
    return { success: false, error: 'Engine already running for this project' };
  }

  // Get the project's CLI agent type and check installation
  const agentType = project.agent || 'claude-code';
  try {
    const adapter = getAdapter(agentType);
    const checkResult = await adapter.checkInstallation();
    if (!checkResult.installed) {
      return {
        success: false,
        error: `${adapter.displayName} CLI 未安装: ${checkResult.error || '请先安装后再试'}`,
      };
    }
  } catch (e) {
    return { success: false, error: `不支持的 CLI 类型: ${agentType}` };
  }

  // Check for existing progress to resume
  const progress = readProgress(projectId) || {
    projectId,
    currentTaskId: null,
    currentPhase: null,
    phaseIndex: 0,
    lastOutput: '',
    lastLogFile: null,
    lastRunAt: null,
  };

  // Update project status
  updateProject(projectId, { status: 'running' });
  notifyStatusChange(mainWindow, projectId, 'running');

  // Initialize output batcher for 60fps rendering
  const batcher = new OutputBatcher(projectId, mainWindow, (chunk) => {
    appendProgressBuffer(projectId, chunk);
  });
  outputBatchers.set(projectId, batcher);

  // Initialize engine state
  engines.set(projectId, {
    projectId,
    stopping: false,
    currentProcess: null,
    mainWindow,
    resumedFrom: progress.currentTaskId ? progress : null,
  });

  // Start the engine loop asynchronously
  runEngineLoop(projectId, mainWindow).catch(err => {
    console.error(`Engine error for project ${projectId}:`, err);
    updateProject(projectId, { status: 'idle' });
    notifyStatusChange(mainWindow, projectId, 'idle');
    cleanupProjectResources(projectId);
  });

  return {
    success: true,
    message: progress.currentTaskId
      ? `从任务 ${progress.currentTaskId} 的 ${progress.currentPhase} 阶段继续`
      : '引擎已启动，开始处理任务',
  };
}

/**
 * Pause a project's engine
 */
async function pauseProject(projectId) {
  const engine = engines.get(projectId);
  if (!engine) {
    return { success: false, error: 'No engine running for this project' };
  }

  engine.stopping = true;

  // Kill the current CLI process
  const proc = engine.currentProcess;
  if (proc) {
    try {
      // 先尝试优雅终止
      proc.kill('SIGTERM');

      // 给进程 3 秒时间优雅退出
      const forceKillTimer = setTimeout(() => {
        try {
          // 检查进程是否还在运行
          if (engine.currentProcess === proc) {
            proc.kill('SIGKILL');
            console.log(`[Engine] Force killed process for project ${projectId}`);
          }
        } catch (e) {
          // 进程可能已经退出
        }
      }, 3000);

      // 如果进程正常退出，取消强制终止
      proc.on('exit', () => {
        clearTimeout(forceKillTimer);
      });
    } catch (e) {
      console.error(`[Engine] Error killing process: ${e.message}`);
    }
    // 清除进程引用
    engine.currentProcess = null;
  }

  updateProject(projectId, { status: 'paused' });
  notifyStatusChange(engine.mainWindow, projectId, 'paused');
  cleanupProjectResources(projectId);

  return { success: true, message: '引擎已暂停' };
}

function cleanupProjectResources(projectId) {
  // Flush and destroy output batcher
  const batcher = outputBatchers.get(projectId);
  if (batcher) {
    batcher.destroy();
    outputBatchers.delete(projectId);
  }
  // Flush progress buffer to disk
  if (progressFlushTimers.has(projectId)) {
    clearTimeout(progressFlushTimers.get(projectId));
    progressFlushTimers.delete(projectId);
  }
  flushProgressBuffer(projectId);
  engines.delete(projectId);
}

function getEngineStatus(projectId) {
  const project = getProject(projectId);
  if (!project) return { status: 'unknown' };
  const isRunning = engines.has(projectId);
  return {
    status: isRunning ? 'running' : project.status,
    isRunning,
  };
}

function getProgress(projectId) {
  return readProgress(projectId);
}

function clearTerminalHistory(projectId) {
  const progress = readProgress(projectId);
  if (!progress) return { success: false, error: 'No progress found' };
  writeProgress(projectId, { ...progress, lastOutput: '' });
  // Also clear memory buffer
  const buffer = progressBuffers.get(projectId);
  if (buffer) {
    buffer.content = '';
  }
  return { success: true };
}

function getTerminalHistory(projectId) {
  const progress = readProgress(projectId);
  if (progress?.lastOutput) {
    return { content: progress.lastOutput, logFile: progress?.lastLogFile || null };
  }

  // Fallback: parse log file if no cached output
  if (!progress?.lastLogFile || !fs.existsSync(progress.lastLogFile)) {
    return { content: '', logFile: progress?.lastLogFile || null };
  }

  const content = fs.readFileSync(progress.lastLogFile, 'utf-8');
  return {
    content: parseTerminalContent(content),
    logFile: progress.lastLogFile,
  };
}

function parseTerminalContent(rawContent) {
  return rawContent
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      try {
        return extractPrintableText(JSON.parse(trimmed));
      } catch (error) {
        return line;
      }
    })
    .filter(Boolean)
    .join('');
}

function recoverProject(projectId) {
  if (engines.has(projectId)) {
    return { recovered: false, reason: 'Engine is currently running' };
  }

  const project = getProject(projectId);
  if (!project) return { recovered: false, reason: 'Project not found' };

  const progress = readProgress(projectId);
  let recovered = false;

  if (project.status === 'running') {
    updateProject(projectId, { status: 'idle' });
    recovered = true;
  }

  if (progress?.currentTaskId) {
    const tasks = listTasks(projectId);
    const activeTask = tasks.find((t) => t.id === progress.currentTaskId);
    if (activeTask && activeTask.boardStatus === 'in_progress' && !['idle', 'completed'].includes(activeTask.executionStatus)) {
      updateTask(projectId, activeTask.id, {
        executionStatus: 'idle',
        lastError: '任务因应用重启而中断，可重新执行',
      });
      recovered = true;
    }
  }

  return { recovered, projectStatus: recovered ? 'idle' : project.status };
}

module.exports = {
  startProject,
  pauseProject,
  getEngineStatus,
  getProgress,
  getTerminalHistory,
  clearTerminalHistory,
  recoverProject,
  forceFlushAllProgressBuffers,
};
