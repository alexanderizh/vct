import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  App,
  Button,
  Card,
  ConfigProvider,
  Descriptions,
  Drawer,
  Dropdown,
  Empty,
  Form,
  Input,
  Layout,
  List,
  Modal,
  Popconfirm,
  Progress,
  Select,
  Space,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import zhCN from 'antd/locale/zh_CN';
import {
  AppstoreOutlined,
  ClearOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  ExpandAltOutlined,
  EyeOutlined,
  FolderOpenOutlined,
  HolderOutlined,
  MoreOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  RightOutlined,
  SaveOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  UpOutlined,
} from '@ant-design/icons';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';
import './styles.css';

const { Header, Sider, Content } = Layout;
const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const BOARD_STATUS_OPTIONS = [
  { value: 'todo', label: '待处理', color: 'default' },
  { value: 'in_progress', label: '进行中', color: 'processing' },
  { value: 'blocked', label: '阻塞', color: 'warning' },
  { value: 'suspended', label: '已挂起', color: 'volcano' },
  { value: 'done', label: '已完成', color: 'success' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'critical', label: '紧急' },
];

const PRIORITY_META = {
  low: { label: '低优先级', color: 'default' },
  medium: { label: '中优先级', color: 'blue' },
  high: { label: '高优先级', color: 'orange' },
  critical: { label: '紧急', color: 'red' },
};

const EXECUTION_STATUS_META = {
  idle: { label: '空闲', color: 'default' },
  queued: { label: '排队中', color: 'default' },
  analyzing: { label: '分析中', color: 'processing' },
  planning: { label: '计划中', color: 'processing' },
  developing: { label: '开发中', color: 'processing' },
  reviewing: { label: '审查中', color: 'purple' },
  testing: { label: '测试中', color: 'cyan' },
  fixing: { label: '修复中', color: 'orange' },
  committing: { label: '提交中', color: 'magenta' },
  completed: { label: '已完成', color: 'success' },
  failed: { label: '失败', color: 'error' },
};

const PROJECT_STATUS_META = {
  idle: { label: '空闲', color: 'default' },
  running: { label: '运行中', color: 'success' },
  paused: { label: '已暂停', color: 'warning' },
};

function getBoardMeta(status) {
  return BOARD_STATUS_OPTIONS.find((item) => item.value === status) || BOARD_STATUS_OPTIONS[0];
}

function getExecutionMeta(status) {
  return EXECUTION_STATUS_META[status] || EXECUTION_STATUS_META.idle;
}

function getProjectMeta(status) {
  return PROJECT_STATUS_META[status] || PROJECT_STATUS_META.idle;
}

function getPriorityMeta(priority) {
  return PRIORITY_META[priority] || PRIORITY_META.medium;
}

function formatTime(value) {
  if (!value) return '暂无';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function sanitizeTerminalOutput(value) {
  if (!value) return '';

  return String(value)
    .replace(/Warning: no stdin data received in 3s,[^\n]*\n?/g, '')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.length > 140) {
        return !(
          trimmed.includes('"type":"system"') ||
          trimmed.includes('"tools":[') ||
          trimmed.includes('"permissionMode"') ||
          trimmed.includes('"mcp__')
        );
      }
      return true;
    })
    .join('\n');
}

function TaskDetailSection({ title, content }) {
  return (
    <div className="detail-section">
      <Title level={5}>{title}</Title>
      {content ? (
        <Paragraph className="detail-content">{content}</Paragraph>
      ) : (
        <Text type="secondary">暂无内容</Text>
      )}
    </div>
  );
}

function EnvironmentStatusCard({ title, installed, summary, details }) {
  return (
    <div className={`env-status-card ${installed ? 'is-ready' : 'is-error'}`}>
      <div className="env-status-head">
        <div className={`env-dot ${installed ? 'is-ready' : 'is-error'}`} />
        <div>
          <Text strong>{title}</Text>
          <div className="env-summary">{summary}</div>
        </div>
      </div>
      <Paragraph className="env-details">
        {details || '暂无更多信息'}
      </Paragraph>
    </div>
  );
}

function MetricTile({ label, value, hint, tone }) {
  return (
    <div className={`metric-tile ${tone ? `tone-${tone}` : ''}`}>
      <Text className="metric-label">{label}</Text>
      <div className="metric-value">{value}</div>
      <Text className="metric-hint">{hint}</Text>
    </div>
  );
}

function NavButton({ active, icon, label, onClick }) {
  return (
    <button type="button" className={active ? 'nav-button is-active' : 'nav-button'} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function EnvironmentPage({ environment, onRefresh }) {
  const checks = [
    {
      key: 'claude',
      title: 'Claude Code',
      installed: Boolean(environment.claude?.installed),
      summary: environment.claude?.installed ? 'CLI 已连接，可直接执行自动开发任务' : 'CLI 尚未就绪',
      details: environment.claude?.installed
        ? `${environment.claude.version}\n${environment.claude.authStatus || ''}`
        : environment.claude?.error,
      action: environment.claude?.installed ? '可开始项目自动化流程' : '请先完成 CLI 安装或鉴权',
    },
    {
      key: 'git',
      title: 'Git',
      installed: Boolean(environment.git?.installed),
      summary: environment.git?.installed ? '版本控制环境可用' : 'Git 尚未就绪',
      details: environment.git?.installed ? environment.git.version : environment.git?.error,
      action: environment.git?.installed ? '支持拉取、提交与变更追踪' : '请先安装 Git 或检查 PATH',
    },
  ];

  const readyCount = checks.filter((item) => item.installed).length;
  const pendingChecks = checks.filter((item) => !item.installed);
  const nextSteps = pendingChecks.length
    ? pendingChecks.map((item) => `${item.title} 需要处理：${item.action}`)
    : [
        '当前基础依赖已经就绪，可以直接回到项目工作台启动自动开发流程。',
        '如果后续增加 Node、pnpm、Python 等检查项，这里会继续集中展示。',
      ];

  return (
    <div className="environment-page">
      <Card className="environment-hero">
        <div className="environment-hero-head">
          <div>
            <Title level={3}>本地环境检查</Title>
            <Paragraph className="environment-hero-copy">
              这里集中检查 VCT 运行依赖，避免把环境诊断和项目工作台混在一起。
            </Paragraph>
          </div>
          <Button type="primary" icon={<ReloadOutlined />} onClick={onRefresh}>
            重新检查
          </Button>
        </div>

        <div className="overview-metrics">
          <MetricTile label="检查项" value={checks.length} hint="当前内置环境检查项数" />
          <MetricTile label="已通过" value={readyCount} hint="可直接投入使用的能力" tone="success" />
          <MetricTile
            label="待处理"
            value={checks.length - readyCount}
            hint={checks.length - readyCount ? '建议优先补齐基础依赖' : '当前环境完整'}
            tone={checks.length - readyCount ? 'warning' : 'accent'}
          />
          <MetricTile
            label="整体状态"
            value={readyCount === checks.length ? '就绪' : '待完善'}
            hint="环境状态会影响后续自动执行"
            tone="accent"
          />
        </div>
      </Card>

      <div className="environment-grid">
        {checks.map((item) => (
          <Card key={item.key} className="environment-panel" title={item.title}>
            <EnvironmentStatusCard
              title={item.title}
              installed={item.installed}
              summary={item.summary}
              details={item.details}
            />
            <div className="environment-note">
              <Text strong>{item.action}</Text>
            </div>
          </Card>
        ))}
      </div>

      <div className="environment-bottom-grid">
        <Card title="下一步建议" className="environment-panel">
          <div className="environment-checklist">
            {nextSteps.map((step) => (
              <div key={step} className="environment-checklist-item">
                <span className="environment-checklist-dot" />
                <Text>{step}</Text>
              </div>
            ))}
          </div>
        </Card>

        <Card title="诊断摘要" className="environment-panel">
          <div className="environment-summary-stack">
            <div className="environment-summary-item">
              <Text className="metric-label">Claude Code</Text>
              <Text strong>{environment.claude?.installed ? '已连接并鉴权' : '未就绪'}</Text>
            </div>
            <div className="environment-summary-item">
              <Text className="metric-label">Git</Text>
              <Text strong>{environment.git?.installed ? '可用于拉取与提交' : '未就绪'}</Text>
            </div>
            <div className="environment-summary-item">
              <Text className="metric-label">推荐动作</Text>
              <Text strong>{pendingChecks.length ? '先补齐依赖，再启动项目' : '可以返回工作台开始执行'}</Text>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function TerminalPanel({ projectId }) {
  const containerRef = useRef(null);
  const terminalRef = useRef(null);
  const fitRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || terminalRef.current) {
      return undefined;
    }

    const terminal = new Terminal({
      convertEol: true,
      theme: {
        background: '#101828',
        foreground: '#e2e8f0',
        cursor: '#7dd3fc',
        cursorBlink: true,
        cursorStyle: 'block',
        selectionBackground: 'rgba(125, 211, 252, 0.25)',
        black: '#101828',
        brightBlack: '#555',
        red: '#e06c75',
        brightRed: '#e06c75',
        green: '#98c379',
        brightGreen: '#98c379',
        yellow: '#e5c07b',
        brightYellow: '#e5c07b',
        blue: '#61afef',
        brightBlue: '#61afef',
        magenta: '#c678dd',
        brightMagenta: '#c678dd',
        cyan: '#56b6c2',
        brightCyan: '#56b6c2',
        white: '#abb2bf',
        brightWhite: '#e0e0e0',
      },
      fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
      fontSize: 13,
      lineHeight: 1.4,
      scrollback: 8000,
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());
    terminal.open(containerRef.current);
    fitAddon.fit();
    terminalRef.current = terminal;
    fitRef.current = fitAddon;

    const ro = new ResizeObserver(() => {
      fitRef.current?.fit();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadHistory() {
      if (!projectId || !terminalRef.current) return;
      const history = await window.vct.getTerminalHistory(projectId);
      if (active && terminalRef.current) {
        terminalRef.current.clear();
        terminalRef.current.write(sanitizeTerminalOutput(history?.content || ''));
        fitRef.current?.fit();
      }
    }

    loadHistory();

    return () => {
      active = false;
    };
  }, [projectId]);

  useEffect(() => {
    const onData = ({ projectId: incomingProjectId, data }) => {
      if (incomingProjectId === projectId && terminalRef.current) {
        const printable = sanitizeTerminalOutput(data);
        if (printable) {
          terminalRef.current.write(printable);
        }
      }
    };

    const onClear = ({ projectId: incomingProjectId }) => {
      if (incomingProjectId === projectId && terminalRef.current) {
        terminalRef.current.clear();
      }
    };

    window.vct.onTerminalData(onData);
    window.vct.onTerminalClear(onClear);

    return () => {
      window.vct.removeTerminalDataListener();
      window.vct.removeTerminalClearListener();
    };
  }, [projectId]);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
        background: '#101828',
      }}
    />
  );
}

function AppView() {
  const { message } = App.useApp();
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [progress, setProgress] = useState(null);
  const [environment, setEnvironment] = useState({ claude: null, git: null });
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [activeTask, setActiveTask] = useState(null);
  const [draggingTaskId, setDraggingTaskId] = useState(null);
  const [activeView, setActiveView] = useState('workspace');
  const [terminalFullscreenOpen, setTerminalFullscreenOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [overviewCollapsed, setOverviewCollapsed] = useState(false);
  const [boardSearchText, setBoardSearchText] = useState('');
  const [boardStatusFilter, setBoardStatusFilter] = useState('all');
  const [projectForm] = Form.useForm();
  const [taskForm] = Form.useForm();

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  );

  const completionStats = useMemo(() => {
    const doneCount = tasks.filter((task) => task.boardStatus === 'done').length;
    const suspendedCount = tasks.filter((task) => task.boardStatus === 'suspended').length;
    const executableCount = tasks.filter((task) => task.boardStatus !== 'blocked' && task.boardStatus !== 'suspended').length;
    const blockedCount = tasks.filter((task) => task.boardStatus === 'blocked').length;
    return {
      total: tasks.length,
      done: doneCount,
      blocked: blockedCount,
      suspended: suspendedCount,
      percent: executableCount > 0 ? Math.round((doneCount / executableCount) * 100) : 0,
    };
  }, [tasks]);

  const activeTaskTitle = useMemo(() => {
    if (!progress?.currentTaskId) return '暂无';
    return tasks.find((task) => task.id === progress.currentTaskId)?.title || progress.currentTaskId;
  }, [progress, tasks]);

  const selectedProjectStatus = selectedProject ? getProjectMeta(selectedProject.status) : getProjectMeta();
  const currentPhaseMeta = getExecutionMeta(progress?.currentPhase);

  async function loadEnvironment() {
    const [claude, git] = await Promise.all([window.vct.checkClaude(), window.vct.checkGit()]);
    setEnvironment({ claude, git });
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
      setProgress(null);
      setActiveTask(null);
      return;
    }

    const [taskList, progressSnapshot, engineStatus] = await Promise.all([
      window.vct.listTasks(projectId),
      window.vct.getProgress(projectId),
      window.vct.getEngineStatus(projectId),
    ]);

    if (engineStatus.status === 'running' && !engineStatus.isRunning) {
      const recovery = await window.vct.recoverProject(projectId);
      if (recovery.recovered) {
        const [recoveredTasks, recoveredProgress, recoveredProjects] = await Promise.all([
          window.vct.listTasks(projectId),
          window.vct.getProgress(projectId),
          window.vct.listProjects(),
        ]);
        setProjects(recoveredProjects);
        setTasks(recoveredTasks);
        setProgress(recoveredProgress);
        return;
      }
    }

    setTasks(taskList);
    setProgress(progressSnapshot);
    if (activeTask) {
      setActiveTask(taskList.find((task) => task.id === activeTask.id) || null);
    }
  }

  useEffect(() => {
    loadEnvironment();
    loadProjects();

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

    return () => {
      window.vct.removeEngineStatusListener();
      window.vct.removeTaskStatusListener();
    };
  }, [selectedProjectId, activeTask]);

  useEffect(() => {
    loadProjectDetails(selectedProjectId);
  }, [selectedProjectId]);

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

  async function handleChooseDirectory(fieldName = 'workDir') {
    const selectedPath = await window.vct.chooseProjectDirectory();
    if (selectedPath) {
      projectForm.setFieldValue(fieldName, selectedPath);
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

  function openCreateTaskModal() {
    setEditingTask(null);
    taskForm.setFieldsValue({
      title: '',
      description: '',
      priority: 'medium',
      boardStatus: 'todo',
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

  const projectMenuItems = (project) => [
    {
      key: 'edit',
      label: '编辑项目',
      icon: <EditOutlined />,
      onClick: () => openEditProjectModal(project),
    },
    {
      key: 'delete',
      label: (
        <Popconfirm
          title="确认移除项目？"
          description="仅删除 VCT 管理记录，不会删除工作目录源码。"
          onConfirm={() => handleDeleteProject(project.id)}
        >
          <span>删除项目</span>
        </Popconfirm>
      ),
      icon: <DeleteOutlined />,
    },
  ];

  return (
    <Layout className="app-shell">
      <Sider width={320} className="project-sider">
        <div className="brand-block">
          <Title level={3}>VCT</Title>
          <Text className="brand-subtitle">Visual Claude Task Manager</Text>
        </div>

        <div className="side-nav">
          <NavButton
            active={activeView === 'workspace'}
            icon={<AppstoreOutlined />}
            label="项目工作台"
            onClick={() => setActiveView('workspace')}
          />
          <NavButton
            active={activeView === 'environment'}
            icon={<SettingOutlined />}
            label="本地环境"
            onClick={() => setActiveView('environment')}
          />
        </div>

        <div className="section-header">
          <Title level={5}>项目列表</Title>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateProjectModal}>
            新建项目
          </Button>
        </div>

        <List
          className="project-list"
          dataSource={projects}
          locale={{ emptyText: <Empty description="还没有项目" /> }}
          renderItem={(project) => {
            const meta = getProjectMeta(project.status);
            return (
              <List.Item
                className={project.id === selectedProjectId ? 'project-item project-item-active' : 'project-item'}
                onClick={() => {
                  setSelectedProjectId(project.id);
                  setActiveView('workspace');
                }}
              >
                <div className="project-item-inner">
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <Space className="space-between full-width">
                      <Text strong>{project.name}</Text>
                      <Dropdown menu={{ items: projectMenuItems(project) }} trigger={['click']}>
                        <Button
                          size="small"
                          type="text"
                          icon={<MoreOutlined />}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </Dropdown>
                    </Space>
                    <div className="project-item-meta">
                      <Tag color={meta.color}>{meta.label}</Tag>
                      <Text type="secondary">{project.agent || 'claude-code'}</Text>
                    </div>
                    <Text type="secondary" className="muted-line">{project.workDir}</Text>
                  </Space>
                </div>
              </List.Item>
            );
          }}
        />
      </Sider>

      <Layout>
        <Header className="top-header">
          {activeView === 'environment' ? (
            <div className="header-bar">
              <div className="header-copy">
                <Title level={4} style={{ marginBottom: 0 }}>本地环境</Title>
                <Text type="secondary">集中查看 Claude Code、Git 以及后续扩展的运行依赖</Text>
              </div>
              <Space>
                <Button icon={<ReloadOutlined />} onClick={loadEnvironment}>
                  重新检查
                </Button>
              </Space>
            </div>
          ) : selectedProject ? (
            <div className="header-bar">
              <div className="header-copy">
                <Title level={4} style={{ marginBottom: 0 }}>{selectedProject.name}</Title>
                <Text type="secondary">{selectedProject.description || '本地 Claude Code 自动开发项目'}</Text>
                <div className="header-meta-row">
                  <Tag color={selectedProjectStatus.color}>{selectedProjectStatus.label}</Tag>
                  <Tag color={currentPhaseMeta.color}>{currentPhaseMeta.label}</Tag>
                  <Text type="secondary">当前任务：{activeTaskTitle}</Text>
                </div>
              </div>
              <Space>
                <Button icon={<EditOutlined />} onClick={() => openEditProjectModal(selectedProject)}>
                  项目设置
                </Button>
              </Space>
            </div>
          ) : (
            <Title level={4} style={{ marginBottom: 0 }}>选择或创建项目</Title>
          )}
        </Header>

        <Content className="content-shell">
          {activeView === 'environment' ? (
            <div className="column-scroll">
              <EnvironmentPage environment={environment} onRefresh={loadEnvironment} />
            </div>
          ) : !selectedProject ? (
            <Card>
              <Empty description="先创建一个项目，再开始自动开发流程" />
            </Card>
          ) : (
            <div className="workspace-grid">
              <div className="workspace-main column-scroll">
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <Card
                    className="hero-card"
                    title={
                      <div className="space-between full-width" style={{ cursor: 'pointer', paddingRight: 8 }} onClick={() => setOverviewCollapsed(!overviewCollapsed)}>
                        <span>项目概览</span>
                        {overviewCollapsed ? <RightOutlined style={{ fontSize: 12, color: 'var(--text-soft)' }} /> : <DownOutlined style={{ fontSize: 12, color: 'var(--text-soft)' }} />}
                      </div>
                    }
                    extra={(
                      <Space>
                        <Button icon={<PlusOutlined />} onClick={openCreateTaskModal}>
                          新建需求
                        </Button>
                        {selectedProject.status === 'running' ? (
                          <Button danger icon={<PauseCircleOutlined />} onClick={handlePauseProject}>
                            暂停
                          </Button>
                        ) : (
                          <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleStartProject}>
                            开始
                          </Button>
                        )}
                      </Space>
                    )}
                  >
                    {!overviewCollapsed && (
                      <>
                        <div className="overview-metrics">
                          <MetricTile
                            label="需求总数"
                            value={completionStats.total}
                            hint={completionStats.total ? '当前项目需求池' : '还没有需求'}
                          />
                          <MetricTile
                            label="已完成"
                            value={completionStats.done}
                            hint={completionStats.total ? '已达到可交付状态的任务' : '等待开始'}
                            tone="success"
                          />
                          <MetricTile
                            label="阻塞项"
                            value={completionStats.blocked}
                            hint={completionStats.blocked ? '建议优先解除依赖' : '暂无阻塞'}
                            tone={completionStats.blocked ? 'warning' : 'neutral'}
                          />
                          <MetricTile
                            label="当前阶段"
                            value={currentPhaseMeta.label}
                            hint={`最近运行 ${formatTime(progress?.lastRunAt)}`}
                            tone="accent"
                          />
                        </div>
                        <div className="progress-block">
                          <div className="progress-copy">
                            <Text strong>整体进度</Text>
                            <Text type="secondary">当前任务：{activeTaskTitle}</Text>
                          </div>
                          <div className="progress-value">{completionStats.percent}%</div>
                        </div>
                        <Progress percent={completionStats.percent} strokeColor="#14b8a6" trailColor="rgba(20, 184, 166, 0.14)" style={{ marginTop: 12 }} />
                        <Descriptions column={1} size="small" className="project-description">
                          <Descriptions.Item label="工作目录">{selectedProject.workDir}</Descriptions.Item>
                          <Descriptions.Item label="CLI Agent">{selectedProject.agent}</Descriptions.Item>
                          <Descriptions.Item label="当前任务">{activeTaskTitle}</Descriptions.Item>
                          <Descriptions.Item label="当前阶段">{progress?.currentPhase || '未启动'}</Descriptions.Item>
                          <Descriptions.Item label="最近运行">{formatTime(progress?.lastRunAt)}</Descriptions.Item>
                        </Descriptions>
                      </>
                    )}
                  </Card>

                  <Card
                    title="需求看板"
                    extra={<Text type="secondary">拖拽排序，点击卡片查看详情</Text>}
                  >
                    <div className="board-filter-bar">
                      <Input.Search
                        placeholder="搜索需求标题或描述"
                        allowClear
                        value={boardSearchText}
                        onChange={(e) => setBoardSearchText(e.target.value)}
                        style={{ width: 260 }}
                      />
                      <Select
                        value={boardStatusFilter}
                        onChange={setBoardStatusFilter}
                        style={{ width: 140 }}
                        options={[
                          { value: 'all', label: '全部状态' },
                          ...BOARD_STATUS_OPTIONS.map((item) => ({ value: item.value, label: item.label })),
                        ]}
                      />
                    </div>
                    {tasks.length === 0 ? (
                      <Empty description="还没有需求，点击右上角创建" />
                    ) : (
                      <div className="task-board">
                        {tasks
                          .filter((task) => {
                            if (boardStatusFilter !== 'all' && task.boardStatus !== boardStatusFilter) return false;
                            if (boardSearchText) {
                              const keyword = boardSearchText.toLowerCase();
                              return task.title.toLowerCase().includes(keyword) ||
                                (task.description || '').toLowerCase().includes(keyword);
                            }
                            return true;
                          })
                          .map((task) => {
                          const boardMeta = getBoardMeta(task.boardStatus);
                          const executionMeta = getExecutionMeta(task.executionStatus);
                          const priorityMeta = getPriorityMeta(task.priority);
                          return (
                            <div
                              key={task.id}
                              draggable
                              className={draggingTaskId === task.id ? 'task-card-shell dragging' : 'task-card-shell'}
                              onDragStart={() => setDraggingTaskId(task.id)}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={() => reorderTasks(draggingTaskId, task.id)}
                              onDragEnd={() => setDraggingTaskId(null)}
                            >
                              <Card
                                className={activeTask?.id === task.id ? 'task-card is-active' : 'task-card'}
                                onClick={() => {
                                  setActiveTask(task);
                                  setTaskDrawerOpen(true);
                                }}
                              >
                                <div className="task-card-head">
                                  <Space wrap>
                                    <HolderOutlined className="drag-handle" />
                                    <Tag color={priorityMeta.color}>{priorityMeta.label}</Tag>
                                    <Tag color={boardMeta.color}>{boardMeta.label}</Tag>
                                    <Tag color={executionMeta.color}>{executionMeta.label}</Tag>
                                  </Space>
                                  <Space>
                                    <Button
                                      type="text"
                                      size="small"
                                      icon={<ThunderboltOutlined />}
                                      title="立即执行"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        handleMoveTaskToFirst(task.id);
                                      }}
                                    />
                                    <Button
                                      type="text"
                                      size="small"
                                      icon={<EyeOutlined />}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setActiveTask(task);
                                        setTaskDrawerOpen(true);
                                      }}
                                    />
                                    <Button
                                      type="text"
                                      size="small"
                                      icon={<EditOutlined />}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        openEditTaskModal(task);
                                      }}
                                    />
                                    <Popconfirm
                                      title="确认删除需求？"
                                      onConfirm={(event) => {
                                        event?.stopPropagation?.();
                                        handleDeleteTask(task.id);
                                      }}
                                    >
                                      <Button
                                        danger
                                        type="text"
                                        size="small"
                                        icon={<DeleteOutlined />}
                                        onClick={(event) => event.stopPropagation()}
                                      />
                                    </Popconfirm>
                                  </Space>
                                </div>
                                <Title level={5} className="task-card-title">{task.title}</Title>
                                <Paragraph ellipsis={{ rows: 3 }} className="task-card-paragraph">
                                  {task.description || '暂无需求说明'}
                                </Paragraph>
                                <div className="task-card-footer">
                                  <div className="task-card-footer-left">
                                    <Text type="secondary" className="muted-line">
                                      更新于 {formatTime(task.updatedAt)}
                                    </Text>
                                  </div>
                                  <Select
                                    size="small"
                                    value={task.boardStatus}
                                    options={BOARD_STATUS_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
                                    onChange={(nextValue) => handleTaskStatusChange(task.id, nextValue)}
                                    onClick={(event) => event.stopPropagation()}
                                    style={{ width: 148 }}
                                  />
                                </div>
                              </Card>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>
                </Space>
              </div>

              <div className="workspace-side column-scroll">
                <Card
                  title="实时终端"
                  className="terminal-card"
                  extra={(
                    <Space>
                      <Text type="secondary">仅保留可读输出</Text>
                      <Popconfirm
                        title="确认清除终端日志？"
                        description="清除后将无法恢复当前终端输出。"
                        onConfirm={async () => {
                          await window.vct.clearTerminalHistory(selectedProjectId);
                          message.success('日志已清除');
                        }}
                      >
                        <Button type="text" icon={<ClearOutlined />}>
                          清除
                        </Button>
                      </Popconfirm>
                      <Button
                        type="text"
                        icon={<ExpandAltOutlined />}
                        onClick={() => setTerminalFullscreenOpen(true)}
                      >
                        全屏
                      </Button>
                    </Space>
                  )}
                >
                  <div className="terminal-frame">
                    <div className="terminal-toolbar">
                      <div className="terminal-status">
                        <span className="terminal-status-dot" />
                        <Text className="terminal-toolbar-text">Live session</Text>
                      </div>
                      <Text className="terminal-toolbar-text">
                        {progress?.currentPhase ? `阶段：${currentPhaseMeta.label}` : '等待启动'}
                      </Text>
                    </div>
                    {!terminalFullscreenOpen ? <TerminalPanel projectId={selectedProjectId} /> : null}
                  </div>
                  <Text className="terminal-tip">
                    协议级 JSON 和无效噪声已折叠，保留阶段输出、错误和结果摘要。
                  </Text>
                </Card>
              </div>
            </div>
          )}
        </Content>
      </Layout>

      <Modal
        title={editingProject ? '编辑项目' : '新建项目'}
        open={projectModalOpen}
        confirmLoading={loading}
        onCancel={() => {
          setProjectModalOpen(false);
          setEditingProject(null);
        }}
        onOk={handleSaveProject}
        okText={editingProject ? '保存修改' : '创建项目'}
      >
        <Form form={projectForm} layout="vertical" initialValues={{ agent: 'claude-code' }}>
          <Form.Item name="name" label="项目名称" rules={[{ required: true, message: '请输入项目名称' }]}>
            <Input placeholder="例如：Electron 自动开发平台" />
          </Form.Item>
          <Form.Item name="description" label="项目说明">
            <TextArea rows={3} placeholder="描述项目目标、技术背景与约束" />
          </Form.Item>
          <Form.Item name="workDir" label="工作目录">
            <Input
              placeholder="留空则默认创建到当前仓库下的 workspaces 目录"
              addonAfter={<Button type="link" icon={<FolderOpenOutlined />} onClick={() => handleChooseDirectory('workDir')}>选择</Button>}
            />
          </Form.Item>
          <Form.Item name="agent" label="CLI Agent">
            <Select options={[{ value: 'claude-code', label: 'claude code' }]} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingTask ? '编辑需求' : '新建需求'}
        open={taskModalOpen}
        confirmLoading={loading}
        onCancel={() => {
          setTaskModalOpen(false);
          setEditingTask(null);
        }}
        footer={
          editingTask ? (
            <Space>
              <Button onClick={() => { setTaskModalOpen(false); setEditingTask(null); }}>取消</Button>
              <Button type="primary" loading={loading} onClick={handleSaveTask}>
                保存修改
              </Button>
            </Space>
          ) : (
            <Space>
              <Button onClick={() => { setTaskModalOpen(false); setEditingTask(null); }}>取消</Button>
              <Button loading={loading} onClick={handleSaveAndRunTask} icon={<ThunderboltOutlined />}>
                保存并立即执行
              </Button>
              <Button type="primary" loading={loading} onClick={handleSaveTask}>
                保存
              </Button>
            </Space>
          )
        }
      >
        <Form form={taskForm} layout="vertical" initialValues={{ priority: 'medium', boardStatus: 'todo' }}>
          <Form.Item name="title" label="需求标题" rules={[{ required: true, message: '请输入需求标题' }]}>
            <Input placeholder="例如：补齐项目详情页和终端联动" />
          </Form.Item>
          <Form.Item name="description" label="需求描述">
            <TextArea rows={4} placeholder="补充业务目标、验收标准和注意事项" />
          </Form.Item>
          <Form.Item name="priority" label="优先级">
            <Select options={PRIORITY_OPTIONS} />
          </Form.Item>
          <Form.Item name="boardStatus" label="看板状态">
            <Select options={BOARD_STATUS_OPTIONS.map((item) => ({ value: item.value, label: item.label }))} />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={activeTask?.title || '任务详情'}
        width="90%"
        open={taskDrawerOpen}
        onClose={() => setTaskDrawerOpen(false)}
        extra={activeTask ? (
          <Space>
            <Button icon={<EditOutlined />} onClick={() => openEditTaskModal(activeTask)}>编辑</Button>
            <Button icon={<SaveOutlined />} onClick={() => handleTaskStatusChange(activeTask.id, 'done')}>标记完成</Button>
          </Space>
        ) : null}
      >
        {activeTask ? (
          <Space direction="vertical" size={20} style={{ width: '100%' }}>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="优先级">{activeTask.priority}</Descriptions.Item>
              <Descriptions.Item label="看板状态">
                <Tag color={getBoardMeta(activeTask.boardStatus).color}>{getBoardMeta(activeTask.boardStatus).label}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="执行状态">
                <Tag color={getExecutionMeta(activeTask.executionStatus).color}>{getExecutionMeta(activeTask.executionStatus).label}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="提交记录">{activeTask.commitHash || '暂无'}</Descriptions.Item>
              <Descriptions.Item label="最近更新时间">{formatTime(activeTask.updatedAt)}</Descriptions.Item>
            </Descriptions>

            <TaskDetailSection title="需求描述" content={activeTask.description} />
            <TaskDetailSection title="需求分析" content={activeTask.analysis} />
            <TaskDetailSection title="开发计划" content={activeTask.plan} />
            <TaskDetailSection title="代码审查" content={activeTask.reviewResult} />
            <TaskDetailSection title="测试结果" content={activeTask.testResult} />
            <TaskDetailSection title="错误信息" content={activeTask.lastError} />

            <div className="detail-section">
              <Title level={5}>历史执行记录</Title>
              {activeTask.history?.length ? (
                <Timeline
                  items={activeTask.history.map((entry) => ({
                    color: entry.type?.includes('failed') ? 'red' : 'teal',
                    children: (
                      <div>
                        <Space className="space-between full-width">
                          <Text strong>{entry.title || entry.type}</Text>
                          <Text type="secondary">{formatTime(entry.createdAt)}</Text>
                        </Space>
                        <Paragraph className="timeline-content">{entry.content || '无附加信息'}</Paragraph>
                      </div>
                    ),
                  }))}
                />
              ) : (
                <Empty description="暂无历史记录" />
              )}
            </div>
          </Space>
        ) : (
          <Empty description="选择一个任务查看详情" />
        )}
      </Drawer>

      <Modal
        open={terminalFullscreenOpen}
        footer={null}
        width="92vw"
        centered
        destroyOnClose
        className="terminal-fullscreen-modal"
        title={selectedProject ? `${selectedProject.name} · 实时终端` : '实时终端'}
        onCancel={() => setTerminalFullscreenOpen(false)}
      >
        <div className="terminal-frame terminal-frame-fullscreen">
          <div className="terminal-toolbar">
            <div className="terminal-status">
              <span className="terminal-status-dot" />
              <Text className="terminal-toolbar-text">Live session</Text>
            </div>
            <Text className="terminal-toolbar-text">
              {progress?.currentPhase ? `阶段：${currentPhaseMeta.label}` : '等待启动'}
            </Text>
          </div>
          {terminalFullscreenOpen ? <TerminalPanel projectId={selectedProjectId} /> : null}
        </div>
        <Text className="terminal-tip">
          全屏模式适合排查长输出、错误堆栈和多阶段执行日志。
        </Text>
      </Modal>
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
