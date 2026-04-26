const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const { getProject, updateProject } = require('./project');
const { listBugs, updateBug, appendBugHistory, getBug } = require('./bug');
const { getAdapter } = require('./cli-adapters');
const { getAgent, buildAgentCommand } = require('./agent');

// Active bug fix engines per project
const bugEngines = new Map();

// Bug fix phases
const BUG_FIX_PHASES = [
  { key: 'analyze', name: 'Bug 分析', executionStatus: 'analyzing' },
  { key: 'fix', name: '修复 Bug', executionStatus: 'fixing' },
  { key: 'verify', name: '验证修复', executionStatus: 'verifying' },
];

function getBugProgressFilePath(projectId) {
  const project = getProject(projectId);
  if (!project) return null;
  return path.join(project.workDir, '.vct', 'bug-progress.json');
}

function readBugProgress(projectId) {
  const filePath = getBugProgressFilePath(projectId);
  if (!filePath || !fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeBugProgress(projectId, progress) {
  const filePath = getBugProgressFilePath(projectId);
  if (!filePath) return;
  fs.writeFileSync(filePath, JSON.stringify(progress, null, 2), 'utf-8');
}

function getLogStream(projectId) {
  const project = getProject(projectId);
  if (!project) return null;
  const logDir = path.join(project.workDir, '.vct', 'logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFile = path.join(logDir, `bug-fix-${timestamp}.log`);
  return {
    logFile,
    stream: fs.createWriteStream(logFile, { flags: 'a' }),
  };
}

function sendTerminalOutput(mainWindow, projectId, text) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('terminal:data', {
      projectId,
      data: text,
      seq: 0,
      timestamp: Date.now(),
      immediate: true,
    });
  }
}

function notifyBugStatusChange(mainWindow, projectId, bugId, status) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('bug:status-change', {
      projectId,
      bugId,
      status,
      timestamp: Date.now(),
    });
  }
}

/**
 * Build the prompt for bug fix phases
 */
function buildBugFixPrompt(phase, bug, project) {
  const baseContext = `你是运行在本地开发机上的 Bug 修复 Agent。
项目名称: ${project.name}
项目目录: ${project.workDir}

Bug 信息:
- 标题: ${bug.title}
- 描述: ${bug.description || '无详细描述'}
- 严重程度: ${bug.severity}
- 来源: ${bug.source}
- 涉及文件: ${bug.filepaths?.join(', ') || '未知'}
- 复现步骤: ${bug.reproductionSteps || '无'}
- 错误堆栈: ${bug.stackTrace || '无'}

执行原则:
1. 最小化改动范围，只修复当前 Bug
2. 保持代码风格与现有项目一致
3. 不破坏现有功能
4. 添加必要的注释说明修复原因
`;

  const prompts = {
    analyze: `${baseContext}
请分析当前 Bug，输出：
1. Bug 根本原因分析
2. 需要修改的文件和位置
3. 修复方案建议
4. 可能的影响范围

严格限制：
1. 本阶段只允许阅读、分析、总结
2. 严禁修改任何文件
3. 严禁执行 git 操作

请结合实际代码库分析，不要给空泛建议。`,

    fix: `${baseContext}
基于下面的分析结果修复 Bug：
${bug.analysis || '请根据 Bug 信息定位并修复问题'}

要求：
1. 做真实代码修改而不是只给建议
2. 保持和现有项目风格一致
3. 为关键错误路径补齐处理
4. 本阶段不要提交 git commit
5. 完成后说明修改了哪些文件和内容`,

    verify: `${baseContext}
请验证 Bug 修复是否成功：
1. 检查修改的代码是否正确
2. 运行相关测试（如有）
3. 确认 Bug 是否已解决
4. 检查是否有引入新问题的风险

严格限制：
1. 本阶段只做验证和记录
2. 不要修改业务代码
3. 不要提交 git commit

请输出验证结果和建议。`,
  };

  return prompts[phase] || baseContext;
}

/**
 * Run CLI command for bug fix
 */
function runBugFixCLI(projectId, prompt, workDir, mainWindow, sessionId, agentType = 'claude-code') {
  return new Promise(async (resolve, reject) => {
    let adapter;
    try {
      adapter = getAdapter(agentType);
    } catch (e) {
      return reject(new Error(`不支持的 CLI 类型: ${agentType}`));
    }

    try {
      execSync(`which ${adapter.executable}`, { timeout: 5000 });
    } catch (e) {
      return reject(new Error(`${adapter.displayName} CLI 未安装`));
    }

    const { stream: logStream } = getLogStream(projectId);

    const args = adapter.buildCommandArgs({
      prompt,
      workDir,
      sessionId,
      maxTurns: 20,
    });

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

          if (event.type === 'session' && event.sessionId) {
            capturedSessionId = event.sessionId;
          }

          const printable = adapter.extractPrintableText(event);
          if (printable) {
            finalResult += printable;
            sendTerminalOutput(mainWindow, projectId, printable);
          }

          if (event.type === 'result_content' && event.text) {
            fallbackResult = event.text;
          }
        }
        newlineIndex = buffer.indexOf('\n');
      }
    }

    proc.stdout.on('data', (data) => handleStdoutChunk(data.toString()));

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      logStream.write(text);
      sendTerminalOutput(mainWindow, projectId, text);
    });

    proc.on('close', (code) => {
      logStream.end();

      if (buffer.trim()) {
        const event = adapter.parseOutputLine(buffer.trim());
        const printable = adapter.extractPrintableText(event);
        if (printable) finalResult += printable;
      }

      const engineState = bugEngines.get(projectId);
      const wasIntentionalStop = engineState?.stopping;

      if (code === 0) {
        resolve({
          success: true,
          output: finalResult.trim() || fallbackResult.trim() || stdout,
          fullOutput: stdout,
          sessionId: capturedSessionId,
        });
      } else if (wasIntentionalStop) {
        resolve({
          success: false,
          stopped: true,
          output: finalResult.trim() || fallbackResult.trim() || stdout,
          fullOutput: stdout,
          sessionId: capturedSessionId,
        });
      } else {
        const formattedError = adapter.formatError(stderr);
        reject(new Error(`${adapter.displayName} 退出码 ${code}: ${formattedError}`));
      }
    });

    proc.on('error', (err) => {
      logStream.end();
      reject(new Error(`进程启动失败: ${err.message}`));
    });

    if (bugEngines.has(projectId)) {
      bugEngines.get(projectId).currentProcess = proc;
    }
  });
}

/**
 * Run Agent command for bug fix
 */
function runBugFixAgent(projectId, agentId, prompt, workDir, mainWindow, sessionId) {
  return new Promise(async (resolve, reject) => {
    let commandConfig;
    try {
      commandConfig = buildAgentCommand(agentId, {
        prompt,
        workDir,
        sessionId,
      });
    } catch (e) {
      return reject(new Error(`Agent 配置错误: ${e.message}`));
    }

    const { executable, args, env, adapter, agent } = commandConfig;

    try {
      execSync(`which ${executable}`, { timeout: 5000 });
    } catch (e) {
      return reject(new Error(`${adapter.displayName} CLI 未安装`));
    }

    const { stream: logStream } = getLogStream(projectId);
    logStream.write(`[Agent: ${agent.name}] Using ${adapter.displayName}\n`);

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

          if (event.type === 'session' && event.sessionId) {
            capturedSessionId = event.sessionId;
          }

          const printable = adapter.extractPrintableText(event);
          if (printable) {
            finalResult += printable;
            sendTerminalOutput(mainWindow, projectId, printable);
          }

          if (event.type === 'result_content' && event.text) {
            fallbackResult = event.text;
          }
        }
        newlineIndex = buffer.indexOf('\n');
      }
    }

    proc.stdout.on('data', (data) => handleStdoutChunk(data.toString()));

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      logStream.write(text);
      sendTerminalOutput(mainWindow, projectId, text);
    });

    proc.on('close', (code) => {
      logStream.end();

      if (buffer.trim()) {
        const event = adapter.parseOutputLine(buffer.trim());
        const printable = adapter.extractPrintableText(event);
        if (printable) finalResult += printable;
      }

      const engineState = bugEngines.get(projectId);
      const wasIntentionalStop = engineState?.stopping;

      if (code === 0) {
        resolve({
          success: true,
          output: finalResult.trim() || fallbackResult.trim() || stdout,
          fullOutput: stdout,
          sessionId: capturedSessionId,
        });
      } else if (wasIntentionalStop) {
        resolve({
          success: false,
          stopped: true,
          output: finalResult.trim() || fallbackResult.trim() || stdout,
          fullOutput: stdout,
          sessionId: capturedSessionId,
        });
      } else {
        const formattedError = adapter.formatError(stderr);
        reject(new Error(`${agent.name} 退出码 ${code}: ${formattedError}`));
      }
    });

    proc.on('error', (err) => {
      logStream.end();
      reject(new Error(`进程启动失败: ${err.message}`));
    });

    if (bugEngines.has(projectId)) {
      bugEngines.get(projectId).currentProcess = proc;
    }
  });
}

/**
 * Fix a single bug (not auto-continue to next)
 */
async function fixSingleBug(projectId, bugId, mainWindow) {
  const project = getProject(projectId);
  if (!project) return { success: false, error: 'Project not found' };

  const bug = getBug(projectId, bugId);
  if (!bug) return { success: false, error: 'Bug not found' };

  if (bug.boardStatus === 'done') {
    return { success: false, error: 'Bug 已完成，无需修复' };
  }

  const agentType = project.agent || 'claude-code';
  let useAgentMode = false;
  let taskAgentId = bug.agentId;
  let taskAgent = null;

  if (taskAgentId) {
    taskAgent = getAgent(taskAgentId);
    if (taskAgent && taskAgent.enabled) {
      useAgentMode = true;
    }
  }

  // Clear terminal
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('terminal:clear', { projectId });
  }

  sendTerminalOutput(mainWindow, projectId, `\n${'='.repeat(60)}\n🐛 开始修复 Bug: ${bug.title}\n${'='.repeat(60)}\n\n`);

  // Update bug status
  updateBug(projectId, bugId, { boardStatus: 'in_progress', executionStatus: 'analyzing' });
  notifyBugStatusChange(mainWindow, projectId, bugId, 'analyzing');

  appendBugHistory(projectId, bugId, {
    type: 'bug_fix_started',
    title: '开始修复 Bug',
    content: `开始修复 Bug，工作目录：${project.workDir}`,
  });

  let bugSessionId = bug.sessionId || null;
  let fixFailed = false;

  // Execute fix phases
  for (let phaseIdx = 0; phaseIdx < BUG_FIX_PHASES.length; phaseIdx++) {
    const phase = BUG_FIX_PHASES[phaseIdx];

    sendTerminalOutput(mainWindow, projectId, `\n▶ 阶段 ${phaseIdx + 1}/${BUG_FIX_PHASES.length}: ${phase.name}\n`);

    updateBug(projectId, bugId, { executionStatus: phase.executionStatus });
    notifyBugStatusChange(mainWindow, projectId, bugId, phase.executionStatus);

    appendBugHistory(projectId, bugId, {
      type: 'phase_started',
      phase: phase.key,
      title: `${phase.name}开始`,
      content: `开始执行阶段：${phase.name}`,
    });

    const prompt = buildBugFixPrompt(phase.key, bug, project);

    try {
      let result;
      if (useAgentMode && taskAgentId) {
        result = await runBugFixAgent(projectId, taskAgentId, prompt, project.workDir, mainWindow, bugSessionId);
      } else {
        result = await runBugFixCLI(projectId, prompt, project.workDir, mainWindow, bugSessionId, agentType);
      }

      if (result.sessionId) {
        bugSessionId = result.sessionId;
        updateBug(projectId, bugId, { sessionId: bugSessionId });
      }

      // Store phase result
      const bugUpdates = {};
      if (phase.key === 'analyze') bugUpdates.analysis = result.output;
      if (phase.key === 'fix') bugUpdates.fixResult = result.output;

      if (Object.keys(bugUpdates).length > 0) {
        updateBug(projectId, bugId, bugUpdates);
      }

      appendBugHistory(projectId, bugId, {
        type: 'phase_completed',
        phase: phase.key,
        title: `${phase.name}完成`,
        content: result.output.slice(0, 4000) || `${phase.name}已完成`,
      });

      // Refresh bug data for next phase
      const refreshedBug = getBug(projectId, bugId);
      if (refreshedBug) Object.assign(bug, refreshedBug);

      sendTerminalOutput(mainWindow, projectId, `✅ ${phase.name} 完成\n`);
    } catch (e) {
      sendTerminalOutput(mainWindow, projectId, `❌ ${phase.name} 失败: ${e.message}\n`);
      updateBug(projectId, bugId, {
        executionStatus: 'failed',
        lastError: e.message,
      });
      appendBugHistory(projectId, bugId, {
        type: 'phase_failed',
        phase: phase.key,
        title: `${phase.name}失败`,
        content: e.message,
      });
      fixFailed = true;
      break;
    }
  }

  if (!fixFailed) {
    updateBug(projectId, bugId, {
      boardStatus: 'done',
      executionStatus: 'completed',
    });
    appendBugHistory(projectId, bugId, {
      type: 'bug_fixed',
      title: 'Bug 已修复',
      content: 'Bug 修复完成，验证通过',
    });
    notifyBugStatusChange(mainWindow, projectId, bugId, 'completed');
    sendTerminalOutput(mainWindow, projectId, `\n✅ Bug "${bug.title}" 已修复!\n\n`);
    return { success: true, message: 'Bug 已修复' };
  } else {
    notifyBugStatusChange(mainWindow, projectId, bugId, 'failed');
    return { success: false, error: bug.lastError || '修复失败' };
  }
}

/**
 * Start bug fix loop - fix all bugs one by one
 */
async function startBugFixLoop(projectId, mainWindow) {
  const project = getProject(projectId);
  if (!project) return { success: false, error: 'Project not found' };

  if (bugEngines.has(projectId)) {
    return { success: false, error: 'Bug 修复引擎已在运行' };
  }

  // Initialize engine state
  bugEngines.set(projectId, {
    projectId,
    stopping: false,
    currentProcess: null,
    mainWindow,
    fixingBugId: null,
  });

  // Clear terminal
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('terminal:clear', { projectId });
  }

  sendTerminalOutput(mainWindow, projectId, `\n${'='.repeat(60)}\n🔧 开始批量修复 Bug\n${'='.repeat(60)}\n\n`);

  // Get all bugs that need fixing
  const bugs = listBugs(projectId);
  const bugsToFix = bugs.filter(b => b.boardStatus !== 'done' && b.boardStatus !== 'blocked' && b.boardStatus !== 'suspended');

  if (bugsToFix.length === 0) {
    sendTerminalOutput(mainWindow, projectId, '🎉 没有需要修复的 Bug\n');
    bugEngines.delete(projectId);
    return { success: true, message: '没有需要修复的 Bug' };
  }

  sendTerminalOutput(mainWindow, projectId, `📋 共有 ${bugsToFix.length} 个 Bug 需要修复\n\n`);

  let fixedCount = 0;
  let failedCount = 0;

  for (const bug of bugsToFix) {
    const engine = bugEngines.get(projectId);
    if (engine?.stopping) {
      sendTerminalOutput(mainWindow, projectId, '⏸ Bug 修复已暂停\n');
      break;
    }

    engine.fixingBugId = bug.id;

    const result = await fixSingleBug(projectId, bug.id, mainWindow);

    if (result.success) {
      fixedCount++;
    } else {
      failedCount++;
      // Continue to next bug even if one fails
    }
  }

  // Cleanup
  bugEngines.delete(projectId);

  sendTerminalOutput(mainWindow, projectId, `\n${'='.repeat(60)}\n📊 Bug 修复完成\n${'='.repeat(60)}\n`);
  sendTerminalOutput(mainWindow, projectId, `✅ 成功修复: ${fixedCount} 个\n`);
  sendTerminalOutput(mainWindow, projectId, `❌ 修复失败: ${failedCount} 个\n\n`);

  return {
    success: true,
    message: `批量修复完成: ${fixedCount} 成功, ${failedCount} 失败`,
    fixedCount,
    failedCount,
  };
}

/**
 * Pause bug fix loop
 */
async function pauseBugFix(projectId) {
  const engine = bugEngines.get(projectId);
  if (!engine) {
    return { success: false, error: '没有正在运行的 Bug 修复引擎' };
  }

  engine.stopping = true;

  const proc = engine.currentProcess;
  if (proc) {
    try {
      proc.kill('SIGTERM');
      const forceKillTimer = setTimeout(() => {
        try {
          if (engine.currentProcess === proc) {
            proc.kill('SIGKILL');
          }
        } catch (e) {}
      }, 3000);
      proc.on('exit', () => clearTimeout(forceKillTimer));
    } catch (e) {
      console.error(`Error killing bug fix process: ${e.message}`);
    }
    engine.currentProcess = null;
  }

  bugEngines.delete(projectId);

  return { success: true, message: 'Bug 修复已暂停' };
}

/**
 * Get bug fix engine status
 */
function getBugFixStatus(projectId) {
  const engine = bugEngines.get(projectId);
  if (!engine) {
    return { running: false };
  }
  return {
    running: !engine.stopping,
    stopping: engine.stopping,
    fixingBugId: engine.fixingBugId,
  };
}

module.exports = {
  fixSingleBug,
  startBugFixLoop,
  pauseBugFix,
  getBugFixStatus,
  BUG_FIX_PHASES,
};