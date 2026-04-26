import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App, Card, ConfigProvider, Empty, Form, Layout, Space } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import './styles.css';

// Components
import AppSider from './components/Layout/AppSider';
import AppHeader from './components/Layout/AppHeader';
import EnvironmentPage from './components/Environment/EnvironmentPage';
import AgentList from './components/Agents/AgentList';
import AgentMonitorPage from './components/Agents/AgentMonitorPage';
import Overview from './components/Workspace/Overview';
import TaskBoard from './components/Workspace/TaskBoard';
import BugBoard from './components/Workspace/BugBoard';
import TerminalCard from './components/Terminal/TerminalCard';
import ProjectModal from './components/Modals/ProjectModal';
import TaskModal from './components/Modals/TaskModal';
import BugModal from './components/Modals/BugModal';
import AgentModal from './components/Modals/AgentModal';
import TaskDrawer from './components/Drawers/TaskDrawer';
import BugDrawer from './components/Drawers/BugDrawer';

// Utils & Constants
import { getProjectMeta } from './utils';

const { Content } = Layout;

function AppView() {
  const { message } = App.useApp();

  // State
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [bugs, setBugs] = useState([]);
  const [progress, setProgress] = useState(null);
  const [environment, setEnvironment] = useState({ claude: null, git: null, cliAgents: {} });
  const [cliAgents, setCliAgents] = useState({});
  const [agents, setAgents] = useState([]);

  // Modal & Drawer state
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);
  const [bugModalOpen, setBugModalOpen] = useState(false);
  const [bugDrawerOpen, setBugDrawerOpen] = useState(false);
  const [agentModalOpen, setAgentModalOpen] = useState(false);

  // Editing state
  const [editingProject, setEditingProject] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [editingBug, setEditingBug] = useState(null);
  const [editingAgent, setEditingAgent] = useState(null);
  const [activeTask, setActiveTask] = useState(null);
  const [activeBug, setActiveBug] = useState(null);

  // UI state
  const [draggingTaskId, setDraggingTaskId] = useState(null);
  const [draggingBugId, setDraggingBugId] = useState(null);
  const [activeView, setActiveView] = useState('workspace');
  const [loading, setLoading] = useState(false);
  const [overviewCollapsed, setOverviewCollapsed] = useState(false);
  const [boardSearchText, setBoardSearchText] = useState('');
  const [boardStatusFilter, setBoardStatusFilter] = useState('all');
  const [bugSeverityFilter, setBugSeverityFilter] = useState('all');
  const [bugSourceFilter, setBugSourceFilter] = useState('all');
  const [isFixingAllBugs, setIsFixingAllBugs] = useState(false);
  const [siderCollapsed, setSiderCollapsed] = useState(false);

  // Forms
  const [projectForm] = Form.useForm();
  const [taskForm] = Form.useForm();
  const [bugForm] = Form.useForm();
  const [agentForm] = Form.useForm();

  // Computed values
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  );

  const activeTaskTitle = useMemo(() => {
    if (!progress?.currentTaskId) return '暂无';
    return tasks.find((task) => task.id === progress.currentTaskId)?.title || progress.currentTaskId;
  }, [progress, tasks]);

  // Data loading functions
  async function loadEnvironment() {
    const [claude, git, cliAgentsResult] = await Promise.all([
      window.vct.checkClaude(),
      window.vct.checkGit(),
      window.vct.checkAllCLIs().catch(() => ({})),
    ]);
    setEnvironment({ claude, git, cliAgents: cliAgentsResult });
    setCliAgents(cliAgentsResult);
  }

  async function loadAgents() {
    try {
      const agentList = await window.vct.listAgents();
      setAgents(agentList);
    } catch (e) {
      console.error('Failed to load agents:', e);
      setAgents([]);
    }
  }

  async function loadProjects() {
    const projectList = await window.vct.listProjects();
    setProjects(projectList);
    if (!selectedProjectId && projectList.length > 0) {
      setSelectedProjectId(projectList[0].id);
    }
    if (selectedProjectId && !projectList.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(projectList[0]?.id || null);
    }
  }

  async function loadProjectDetails(projectId) {
    if (!projectId) {
      setTasks([]);
      setBugs([]);
      setProgress(null);
      setActiveTask(null);
      setActiveBug(null);
      return;
    }

    const [taskList, bugList, progressSnapshot, engineStatus] = await Promise.all([
      window.vct.listTasks(projectId),
      window.vct.listBugs(projectId),
      window.vct.getProgress(projectId),
      window.vct.getEngineStatus(projectId),
    ]);

    if (engineStatus.status === 'running' && !engineStatus.isRunning) {
      const recovery = await window.vct.recoverProject(projectId);
      if (recovery.recovered) {
        const [recoveredTasks, recoveredBugs, recoveredProgress, recoveredProjects] = await Promise.all([
          window.vct.listTasks(projectId),
          window.vct.listBugs(projectId),
          window.vct.getProgress(projectId),
          window.vct.listProjects(),
        ]);
        setProjects(recoveredProjects);
        setTasks(recoveredTasks);
        setBugs(recoveredBugs);
        setProgress(recoveredProgress);
        return;
      }
    }

    setTasks(taskList);
    setBugs(bugList);
    setProgress(progressSnapshot);
    if (activeTask) {
      setActiveTask(taskList.find((task) => task.id === activeTask.id) || null);
    }
    if (activeBug) {
      setActiveBug(bugList.find((bug) => bug.id === activeBug.id) || null);
    }
  }

  // Effects
  useEffect(() => {
    loadEnvironment();
    loadProjects();
    loadAgents();

    window.vct.onEngineStatusChange(({ projectId, status }) => {
      setProjects((current) => current.map((project) => (
        project.id === projectId ? { ...project, status } : project
      )));
      if (projectId === selectedProjectId) {
        window.vct.getProgress(projectId).then(setProgress);
      }
    });

    window.vct.onTaskStatusChange(({ projectId }) => {
      if (projectId === selectedProjectId) {
        loadProjectDetails(projectId);
      }
    });

    window.vct.onBugStatusChange(({ projectId }) => {
      if (projectId === selectedProjectId) {
        loadProjectDetails(projectId);
      }
    });

    return () => {
      window.vct.removeEngineStatusListener();
      window.vct.removeTaskStatusListener();
      window.vct.removeBugStatusListener();
    };
  }, [selectedProjectId, activeTask]);

  useEffect(() => {
    loadProjectDetails(selectedProjectId);
  }, [selectedProjectId]);

  // Project handlers
  function openCreateProjectModal() {
    setEditingProject(null);
    projectForm.setFieldsValue({
      name: '',
      description: '',
      workDir: '',
      agent: 'claude-code',
    });
    setProjectModalOpen(true);
  }

  function openEditProjectModal(project) {
    setEditingProject(project);
    projectForm.setFieldsValue({
      name: project.name,
      description: project.description,
      workDir: project.workDir,
      agent: project.agent || 'claude-code',
    });
    setProjectModalOpen(true);
  }

  async function handleChooseDirectory() {
    const selectedPath = await window.vct.chooseProjectDirectory();
    if (selectedPath) {
      projectForm.setFieldValue('workDir', selectedPath);
    }
  }

  async function handleSaveProject() {
    const values = await projectForm.validateFields();
    setLoading(true);
    try {
      if (editingProject) {
        await window.vct.updateProject(editingProject.id, values);
        message.success('项目已更新');
      } else {
        await window.vct.createProject(values);
        message.success('项目已创建');
      }
      setProjectModalOpen(false);
      setEditingProject(null);
      projectForm.resetFields();
      await loadProjects();
      await loadProjectDetails(selectedProjectId);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteProject(projectId) {
    await window.vct.deleteProject(projectId);
    message.success('项目已移除');
    if (selectedProjectId === projectId) {
      setSelectedProjectId(null);
    }
    await loadProjects();
  }

  // Task handlers
  function openCreateTaskModal() {
    setEditingTask(null);
    taskForm.setFieldsValue({
      title: '',
      description: '',
      priority: 'medium',
      boardStatus: 'todo',
      agentId: '',
    });
    setTaskModalOpen(true);
  }

  function openEditTaskModal(task) {
    setEditingTask(task);
    taskForm.setFieldsValue({
      title: task.title,
      description: task.description,
      priority: task.priority,
      boardStatus: task.boardStatus,
      agentId: task.agentId || '',
    });
    setTaskModalOpen(true);
  }

  async function handleSaveTask() {
    if (!selectedProjectId) return;
    const values = await taskForm.validateFields();
    setLoading(true);
    try {
      if (editingTask) {
        await window.vct.updateTask(selectedProjectId, editingTask.id, values);
        message.success('需求已更新');
      } else {
        await window.vct.createTask(selectedProjectId, values);
        message.success('需求已创建');
      }
      setTaskModalOpen(false);
      setEditingTask(null);
      taskForm.resetFields();
      await loadProjectDetails(selectedProjectId);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveAndRunTask() {
    if (!selectedProjectId) return;
    const values = await taskForm.validateFields();
    setLoading(true);
    try {
      let savedTask;
      if (editingTask) {
        savedTask = await window.vct.updateTask(selectedProjectId, editingTask.id, values);
        message.success('需求已更新');
      } else {
        savedTask = await window.vct.createTask(selectedProjectId, values);
        message.success('需求已创建');
      }
      setTaskModalOpen(false);
      setEditingTask(null);
      taskForm.resetFields();
      if (savedTask?.id) {
        await window.vct.moveTaskToFirst(selectedProjectId, savedTask.id);
        message.success('任务已移至最前面，下次将优先执行');
      }
      await loadProjectDetails(selectedProjectId);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteTask(taskId) {
    if (!selectedProjectId) return;
    await window.vct.deleteTask(selectedProjectId, taskId);
    message.success('需求已删除');
    if (activeTask?.id === taskId) {
      setTaskDrawerOpen(false);
      setActiveTask(null);
    }
    await loadProjectDetails(selectedProjectId);
  }

  async function handleTaskStatusChange(taskId, boardStatus) {
    if (!selectedProjectId) return;
    await window.vct.updateTask(selectedProjectId, taskId, { boardStatus });
    await loadProjectDetails(selectedProjectId);
  }

  async function reorderTasks(sourceId, targetId) {
    if (!selectedProjectId || sourceId === targetId) return;
    const ordered = [...tasks];
    const fromIndex = ordered.findIndex((task) => task.id === sourceId);
    const toIndex = ordered.findIndex((task) => task.id === targetId);
    if (fromIndex < 0 || toIndex < 0) return;

    const [moved] = ordered.splice(fromIndex, 1);
    ordered.splice(toIndex, 0, moved);
    const payload = ordered.map((task, index) => ({ id: task.id, order: index + 1 }));
    await window.vct.reorderTasks(selectedProjectId, payload);
    setDraggingTaskId(null);
    await loadProjectDetails(selectedProjectId);
  }

  async function handleMoveTaskToFirst(taskId) {
    if (!selectedProjectId) return;
    await window.vct.moveTaskToFirst(selectedProjectId, taskId);
    message.success('任务已移到最前面');
    await loadProjectDetails(selectedProjectId);
  }

  // Bug handlers
  function openCreateBugModal() {
    setEditingBug(null);
    bugForm.setFieldsValue({
      title: '',
      description: '',
      severity: 'medium',
      source: 'manual',
      boardStatus: 'todo',
      agentId: '',
      relatedTaskId: '',
      filepaths: '',
      reproductionSteps: '',
      stackTrace: '',
    });
    setBugModalOpen(true);
  }

  function openEditBugModal(bug) {
    setEditingBug(bug);
    bugForm.setFieldsValue({
      title: bug.title,
      description: bug.description,
      severity: bug.severity,
      source: bug.source,
      boardStatus: bug.boardStatus,
      agentId: bug.agentId || '',
      relatedTaskId: bug.relatedTaskId || '',
      filepaths: bug.filepaths?.join('\n') || '',
      reproductionSteps: bug.reproductionSteps || '',
      stackTrace: bug.stackTrace || '',
    });
    setBugModalOpen(true);
  }

  async function handleSaveBug() {
    if (!selectedProjectId) return;
    const values = await bugForm.validateFields();
    const bugData = {
      ...values,
      filepaths: values.filepaths ? values.filepaths.split('\n').filter(Boolean) : [],
    };
    setLoading(true);
    try {
      if (editingBug) {
        await window.vct.updateBug(selectedProjectId, editingBug.id, bugData);
        message.success('Bug 已更新');
      } else {
        await window.vct.createBug(selectedProjectId, bugData);
        message.success('Bug 已创建');
      }
      setBugModalOpen(false);
      setEditingBug(null);
      bugForm.resetFields();
      await loadProjectDetails(selectedProjectId);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveAndFixBug() {
    if (!selectedProjectId) return;
    const values = await bugForm.validateFields();
    const bugData = {
      ...values,
      filepaths: values.filepaths ? values.filepaths.split('\n').filter(Boolean) : [],
    };
    setLoading(true);
    try {
      let savedBug;
      if (editingBug) {
        savedBug = await window.vct.updateBug(selectedProjectId, editingBug.id, bugData);
        message.success('Bug 已更新');
      } else {
        savedBug = await window.vct.createBug(selectedProjectId, bugData);
        message.success('Bug 已创建');
      }
      setBugModalOpen(false);
      setEditingBug(null);
      bugForm.resetFields();
      if (savedBug?.id) {
        const result = await window.vct.fixSingleBug(selectedProjectId, savedBug.id);
        if (result.success) {
          message.success('Bug 已修复');
        } else {
          message.error(result.error || '修复失败');
        }
      }
      await loadProjectDetails(selectedProjectId);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteBug(bugId) {
    if (!selectedProjectId) return;
    await window.vct.deleteBug(selectedProjectId, bugId);
    message.success('Bug 已删除');
    if (activeBug?.id === bugId) {
      setBugDrawerOpen(false);
      setActiveBug(null);
    }
    await loadProjectDetails(selectedProjectId);
  }

  async function handleBugStatusChange(bugId, boardStatus) {
    if (!selectedProjectId) return;
    await window.vct.updateBug(selectedProjectId, bugId, { boardStatus });
    await loadProjectDetails(selectedProjectId);
  }

  async function reorderBugs(sourceId, targetId) {
    if (!selectedProjectId || sourceId === targetId) return;
    const ordered = [...bugs];
    const fromIndex = ordered.findIndex((bug) => bug.id === sourceId);
    const toIndex = ordered.findIndex((bug) => bug.id === targetId);
    if (fromIndex < 0 || toIndex < 0) return;

    const [moved] = ordered.splice(fromIndex, 1);
    ordered.splice(toIndex, 0, moved);
    const payload = ordered.map((bug, index) => ({ id: bug.id, order: index + 1 }));
    await window.vct.reorderBugs(selectedProjectId, payload);
    setDraggingBugId(null);
    await loadProjectDetails(selectedProjectId);
  }

  async function handleMoveBugToFirst(bugId) {
    if (!selectedProjectId) return;
    await window.vct.moveBugToFirst(selectedProjectId, bugId);
    message.success('Bug 已移到最前面');
    await loadProjectDetails(selectedProjectId);
  }

  async function handleFixSingleBug(bugId) {
    if (!selectedProjectId) return;
    const result = await window.vct.fixSingleBug(selectedProjectId, bugId);
    if (result.success) {
      message.success('Bug 已修复');
    } else {
      message.error(result.error || '修复失败');
    }
    await loadProjectDetails(selectedProjectId);
  }

  async function handleFixAllBugs() {
    if (!selectedProjectId) return;
    setIsFixingAllBugs(true);
    const result = await window.vct.fixAllBugs(selectedProjectId);
    setIsFixingAllBugs(false);
    if (result.success) {
      message.success(result.message);
    } else {
      message.error(result.error || '批量修复失败');
    }
    await loadProjectDetails(selectedProjectId);
  }

  async function handlePauseBugFix() {
    if (!selectedProjectId) return;
    const result = await window.vct.pauseBugFix(selectedProjectId);
    setIsFixingAllBugs(false);
    if (result.success) {
      message.success(result.message);
    } else {
      message.error(result.error || '暂停失败');
    }
  }

  // Agent handlers
  function openCreateAgentModal() {
    setEditingAgent(null);
    agentForm.setFieldsValue({
      name: '',
      description: '',
      cliType: 'claude-code',
      systemPrompt: '',
      model: '',
      apiBaseUrl: '',
      apiKey: '',
      maxTurns: 30,
      permissionMode: 'bypassPermissions',
      enabled: true,
    });
    setAgentModalOpen(true);
  }

  function openEditAgentModal(agent) {
    setEditingAgent(agent);
    agentForm.setFieldsValue({
      name: agent.name,
      description: agent.description,
      cliType: agent.cliType,
      systemPrompt: agent.systemPrompt || '',
      model: agent.model || '',
      apiBaseUrl: agent.apiBaseUrl || '',
      apiKey: agent.apiKey || '',
      maxTurns: agent.maxTurns || 30,
      permissionMode: agent.permissionMode || 'bypassPermissions',
      enabled: agent.enabled !== false,
    });
    setAgentModalOpen(true);
  }

  async function handleSaveAgent() {
    const values = await agentForm.validateFields();
    setLoading(true);
    try {
      if (editingAgent) {
        await window.vct.updateAgent(editingAgent.id, values);
        message.success('Agent 已更新');
      } else {
        await window.vct.createAgent(values);
        message.success('Agent 已创建');
      }
      setAgentModalOpen(false);
      setEditingAgent(null);
      agentForm.resetFields();
      await loadAgents();
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteAgent(agentId) {
    await window.vct.deleteAgent(agentId);
    message.success('Agent 已删除');
    await loadAgents();
  }

  // Engine handlers
  async function handleStartProject() {
    if (!selectedProjectId) return;
    const result = await window.vct.startProject(selectedProjectId);
    if (result.success) {
      message.success(result.message);
      await loadProjects();
      await loadProjectDetails(selectedProjectId);
    } else {
      message.error(result.error);
    }
  }

  async function handlePauseProject() {
    if (!selectedProjectId) return;
    const result = await window.vct.pauseProject(selectedProjectId);
    if (result.success) {
      message.success(result.message);
      await loadProjects();
      await loadProjectDetails(selectedProjectId);
    } else {
      message.error(result.error);
    }
  }

  async function handleClearTerminalHistory() {
    await window.vct.clearTerminalHistory(selectedProjectId);
    message.success('日志已清除');
  }

  // Render
  return (
    <Layout className="app-shell">
      <AppSider
        collapsed={siderCollapsed}
        projects={projects}
        selectedProjectId={selectedProjectId}
        activeView={activeView}
        onToggleCollapse={() => setSiderCollapsed(!siderCollapsed)}
        onSelectProject={setSelectedProjectId}
        onChangeView={setActiveView}
        onEditProject={openEditProjectModal}
        onDeleteProject={handleDeleteProject}
        onCreateProject={openCreateProjectModal}
      />

      <Layout>
        <AppHeader
          activeView={activeView}
          selectedProject={selectedProject}
          progress={{ ...progress, currentTaskTitle: activeTaskTitle }}
          onEditProject={openEditProjectModal}
          onRefreshEnvironment={loadEnvironment}
        />

        <Content className="content-shell">
          {activeView === 'environment' ? (
            <div className="column-scroll">
              <EnvironmentPage environment={environment} onRefresh={loadEnvironment} />
            </div>
          ) : activeView === 'agents' ? (
            <div className="column-scroll">
              <AgentList
                agents={agents}
                onEdit={(agent) => {
                  if (agent) {
                    openEditAgentModal(agent);
                  } else {
                    openCreateAgentModal();
                  }
                }}
                onDelete={handleDeleteAgent}
              />
            </div>
          ) : activeView === 'agent-monitor' ? (
            <div className="column-scroll">
              <AgentMonitorPage
                agents={agents}
                cliAgents={cliAgents}
                projects={projects}
                onProjectSelect={setSelectedProjectId}
                onViewChange={setActiveView}
              />
            </div>
          ) : !selectedProject ? (
            <Card>
              <Empty description="先创建一个项目，再开始自动开发流程" />
            </Card>
          ) : activeView === 'bugs' ? (
            <div className="workspace-grid">
              <div className="workspace-main column-scroll">
                <BugBoard
                  bugs={bugs}
                  activeBugId={activeBug?.id}
                  draggingBugId={draggingBugId}
                  boardSearchText={boardSearchText}
                  boardStatusFilter={boardStatusFilter}
                  severityFilter={bugSeverityFilter}
                  sourceFilter={bugSourceFilter}
                  isFixingAll={isFixingAllBugs}
                  onSearchChange={setBoardSearchText}
                  onStatusFilterChange={setBoardStatusFilter}
                  onSeverityFilterChange={setBugSeverityFilter}
                  onSourceFilterChange={setBugSourceFilter}
                  onDragStart={setDraggingBugId}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={reorderBugs}
                  onDragEnd={() => setDraggingBugId(null)}
                  onBugClick={(bug) => {
                    setActiveBug(bug);
                    setBugDrawerOpen(true);
                  }}
                  onBugEdit={openEditBugModal}
                  onBugDelete={handleDeleteBug}
                  onBugStatusChange={handleBugStatusChange}
                  onMoveToFirst={handleMoveBugToFirst}
                  onFixSingle={handleFixSingleBug}
                  onFixAll={handleFixAllBugs}
                  onPauseFix={handlePauseBugFix}
                />
              </div>

              <div className="workspace-side column-scroll">
                <TerminalCard
                  projectId={selectedProjectId}
                  project={selectedProject}
                  progress={progress}
                  onClearHistory={handleClearTerminalHistory}
                />
              </div>
            </div>
          ) : (
            <div className="workspace-grid">
              <div className="workspace-main column-scroll">
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <Overview
                    project={selectedProject}
                    progress={progress}
                    tasks={tasks}
                    bugs={bugs}
                    collapsed={overviewCollapsed}
                    onToggleCollapse={() => setOverviewCollapsed(!overviewCollapsed)}
                    onStart={handleStartProject}
                    onPause={handlePauseProject}
                    onCreateTask={openCreateTaskModal}
                    onCreateBug={openCreateBugModal}
                  />

                  <TaskBoard
                    tasks={tasks}
                    activeTaskId={activeTask?.id}
                    draggingTaskId={draggingTaskId}
                    boardSearchText={boardSearchText}
                    boardStatusFilter={boardStatusFilter}
                    onSearchChange={setBoardSearchText}
                    onStatusFilterChange={setBoardStatusFilter}
                    onDragStart={setDraggingTaskId}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={reorderTasks}
                    onDragEnd={() => setDraggingTaskId(null)}
                    onTaskClick={(task) => {
                      setActiveTask(task);
                      setTaskDrawerOpen(true);
                    }}
                    onTaskEdit={openEditTaskModal}
                    onTaskDelete={handleDeleteTask}
                    onTaskStatusChange={handleTaskStatusChange}
                    onMoveToFirst={handleMoveTaskToFirst}
                  />
                </Space>
              </div>

              <div className="workspace-side column-scroll">
                <TerminalCard
                  projectId={selectedProjectId}
                  project={selectedProject}
                  progress={progress}
                  onClearHistory={handleClearTerminalHistory}
                />
              </div>
            </div>
          )}
        </Content>
      </Layout>

      {/* Modals */}
      <ProjectModal
        open={projectModalOpen}
        loading={loading}
        editing={editingProject}
        form={projectForm}
        cliAgents={cliAgents}
        onChooseDirectory={handleChooseDirectory}
        onCancel={() => {
          setProjectModalOpen(false);
          setEditingProject(null);
        }}
        onOk={handleSaveProject}
      />

      <TaskModal
        open={taskModalOpen}
        loading={loading}
        editing={editingTask}
        form={taskForm}
        agents={agents}
        onCancel={() => {
          setTaskModalOpen(false);
          setEditingTask(null);
        }}
        onOk={handleSaveTask}
        onSaveAndRun={handleSaveAndRunTask}
      />

      <AgentModal
        open={agentModalOpen}
        loading={loading}
        editing={editingAgent}
        form={agentForm}
        cliAgents={cliAgents}
        onCancel={() => {
          setAgentModalOpen(false);
          setEditingAgent(null);
        }}
        onOk={handleSaveAgent}
      />

      <BugModal
        open={bugModalOpen}
        loading={loading}
        editing={editingBug}
        form={bugForm}
        agents={agents}
        tasks={tasks}
        onCancel={() => {
          setBugModalOpen(false);
          setEditingBug(null);
        }}
        onOk={handleSaveBug}
        onSaveAndFix={handleSaveAndFixBug}
      />

      {/* Drawers */}
      <TaskDrawer
        open={taskDrawerOpen}
        task={activeTask}
        agents={agents}
        onClose={() => setTaskDrawerOpen(false)}
        onEdit={(task) => {
          setTaskDrawerOpen(false);
          openEditTaskModal(task);
        }}
        onMarkComplete={(taskId) => {
          handleTaskStatusChange(taskId, 'done');
          setTaskDrawerOpen(false);
        }}
      />

      <BugDrawer
        open={bugDrawerOpen}
        bug={activeBug}
        agents={agents}
        tasks={tasks}
        onClose={() => setBugDrawerOpen(false)}
        onEdit={(bug) => {
          setBugDrawerOpen(false);
          openEditBugModal(bug);
        }}
        onFix={(bugId) => {
          handleFixSingleBug(bugId);
          setBugDrawerOpen(false);
        }}
        onMarkComplete={(bugId) => {
          handleBugStatusChange(bugId, 'done');
          setBugDrawerOpen(false);
        }}
      />
    </Layout>
  );
}

function Root() {
  return (
    <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: '#0f766e', borderRadius: 10 } }}>
      <App>
        <AppView />
      </App>
    </ConfigProvider>
  );
}

createRoot(document.getElementById('root')).render(<Root />);
