const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const { getProject, updateProject } = require('./project');
const { listTasks, updateTask, appendTaskHistory } = require('./task');

// Active engines per project
const engines = new Map();

// Per-task session tracking: taskId -> sessionId
const taskSessions = new Map();

// Development phases in order
const PHASES = [
  { key: 'git_pull', name: '拉取最新代码', executionStatus: 'queued' },
  { key: 'analyze', name: '需求分析', executionStatus: 'analyzing' },
  { key: 'plan', name: '制定计划', executionStatus: 'planning' },
  { key: 'develop', name: '开发实现', executionStatus: 'developing' },
  { key: 'review', name: '代码审查', executionStatus: 'reviewing' },
  { key: 'test', name: '功能测试', executionStatus: 'testing' },
  { key: 'fix', name: '修复缺陷', executionStatus: 'fixing' },
  { key: 'commit', name: '提交代码', executionStatus: 'committing' },
];

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
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('terminal:data', {
      projectId,
      data,
      timestamp: Date.now(),
    });
  }
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
function buildPhasePrompt(phase, task, project) {
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
  };

  return prompts[phase] || baseContext;
}

/**
 * Run a single Claude Code command in print mode
 */
function runClaudeCommand(projectId, prompt, workDir, mainWindow, sessionId) {
  return new Promise((resolve, reject) => {
    const { stream: logStream } = getLogStream(projectId);

    const args = [
      '-p', prompt,
      '--permission-mode', 'bypassPermissions',
      '--max-turns', '30',
      '--output-format', 'stream-json',
      '--include-partial-messages',
      '--verbose',
      '--add-dir', workDir,
    ];

    if (sessionId) {
      args.push('--resume', sessionId);
    }

    const proc = spawn('claude', args, {
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
      appendProgressOutput(projectId, text);

      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line) {
          try {
            const event = JSON.parse(line);
            const printable = extractPrintableText(event);
            if (printable) {
              finalResult += printable;
              emitTerminalData(mainWindow, projectId, printable);
            }
            if (event.type === 'result' && typeof event.result === 'string') {
              fallbackResult = event.result;
            }
            if (event.type === 'assistant' && event.message?.content) {
              fallbackResult = flattenContent(event.message.content).trim() || fallbackResult;
            }
            if (event.type === 'system' && event.session_id) {
              capturedSessionId = event.session_id;
            }
          } catch (error) {
            emitTerminalData(mainWindow, projectId, line + '\n');
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
      appendProgressOutput(projectId, text);
      emitTerminalData(mainWindow, projectId, text);
    });

    proc.on('close', (code) => {
      logStream.end();
      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer.trim());
          const printable = extractPrintableText(event);
          if (printable) finalResult += printable;
          if (event.type === 'result' && typeof event.result === 'string') {
            fallbackResult = event.result;
          }
        } catch (error) {
          finalResult += buffer.trim();
        }
      }
      if (code === 0) {
        resolve({ success: true, output: finalResult.trim() || fallbackResult.trim() || stdout, fullOutput: stdout, sessionId: capturedSessionId });
      } else {
        reject(new Error(`Claude Code exited with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      logStream.end();
      reject(err);
    });

    // Store the process so we can kill it on pause
    if (engines.has(projectId)) {
      engines.get(projectId).currentProcess = proc;
    }
  });
}

function extractPrintableText(event) {
  if (!event || typeof event !== 'object') return '';
  if (event.type === 'stream_event' && event.event?.type === 'content_block_delta' && event.event?.delta?.type === 'text_delta') {
    return event.event.delta.text || '';
  }
  if (event.type === 'system' && event.subtype === 'status' && event.status) {
    return `\n[Claude 状态] ${event.status}\n`;
  }
  if (event.type === 'system' && event.subtype === 'api_retry') {
    return `[Claude 重试] 第 ${event.attempt}/${event.max_retries} 次，${event.retry_delay_ms}ms 后重试\n`;
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

    sendTerminalOutput(mainWindow, projectId, `\n${'='.repeat(60)}\n📋 开始处理任务: ${nextTask.title}\n${'='.repeat(60)}\n\n`);

    // Update progress
    const currentProgress = readProgress(projectId);
    writeProgress(projectId, {
      ...currentProgress,
      currentTaskId: nextTask.id,
      currentPhase: currentProgress.currentTaskId === nextTask.id && currentProgress.currentPhase
        ? currentProgress.currentPhase
        : 'analyze',
      phaseIndex: currentProgress.currentTaskId === nextTask.id && typeof currentProgress.phaseIndex === 'number'
        ? currentProgress.phaseIndex
        : 0,
    });

    // Execute each phase for this task
    const freshProgress = readProgress(projectId);
    const phaseStartIndex = resumableTask && freshProgress.currentPhase
      ? Math.max(PHASES.findIndex((phase) => phase.key === freshProgress.currentPhase), 0)
      : 0;

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

    for (let i = phaseStartIndex; i < PHASES.length; i++) {
      if (engine.stopping) break;

      const phase = PHASES[i];

      // Skip git_pull inside the task loop since it has already run once before task processing.
      if (phase.key === 'git_pull') {
        continue;
      }

      sendTerminalOutput(mainWindow, projectId, `\n▶ 阶段 ${i + 1}/${PHASES.length}: ${phase.name}\n`);
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
        phaseIndex: i,
      });

      // Build and execute prompt
      const prompt = buildPhasePrompt(phase.key, nextTask, project);

      try {
        const result = await runClaudeCommand(projectId, prompt, project.workDir, mainWindow, taskSessionId);

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
        if (phase.key === 'commit') {
          // Try to extract commit hash
          const hashMatch = result.output.match(/[0-9a-f]{7,40}/);
          if (hashMatch) taskUpdates.commitHash = hashMatch[0];
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
        sendTerminalOutput(mainWindow, projectId, `❌ ${phase.name} 失败: ${e.message}\n`);
        updateTask(projectId, nextTask.id, {
          executionStatus: 'failed',
          lastError: e.message,
        });
        addHistory(projectId, nextTask.id, {
          type: 'phase_failed',
          phase: phase.key,
          title: `${phase.name}失败`,
          content: e.message,
        });
        writeProgress(projectId, {
          ...readProgress(projectId),
          currentTaskId: nextTask.id,
          currentPhase: phase.key,
          phaseIndex: i,
        });
        taskFailed = true;
        engine.stopping = true;
        updateProject(projectId, { status: 'paused' });
        notifyStatusChange(mainWindow, projectId, 'paused');
        sendTerminalOutput(mainWindow, projectId, '⏸ 引擎已暂停，请修复问题后重新开始，系统会从当前任务继续。\n');
        break;
      }
    }

    // Mark task as completed
    if (!engine.stopping && !taskFailed) {
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
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('terminal:data', {
      projectId,
      data: text,
      timestamp: Date.now(),
    });
  }
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

function appendProgressOutput(projectId, text) {
  const progress = readProgress(projectId);
  if (!progress) return;
  const mergedOutput = `${progress.lastOutput || ''}${text}`;
  writeProgress(projectId, {
    ...progress,
    lastOutput: mergedOutput.slice(-8000),
  });
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

  // Check Claude Code
  try {
    execSync('which claude', { timeout: 5000 });
  } catch (e) {
    return { success: false, error: 'Claude Code CLI not found. Please install it first.' };
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
    engines.delete(projectId);
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

  // Kill the current Claude Code process
  if (engine.currentProcess) {
    try {
      engine.currentProcess.kill('SIGTERM');
      // Force kill after 5 seconds
      setTimeout(() => {
        try { engine.currentProcess.kill('SIGKILL'); } catch (e) {}
      }, 5000);
    } catch (e) {}
  }

  updateProject(projectId, { status: 'paused' });
  notifyStatusChange(engine.mainWindow, projectId, 'paused');
  engines.delete(projectId);

  return { success: true, message: '引擎已暂停' };
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
  return { success: true };
}

function getTerminalHistory(projectId) {
  const progress = readProgress(projectId);
  if (progress?.lastOutput) {
    return { content: progress.lastOutput, logFile: progress?.lastLogFile || null };
  }

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
};
