import React, { useState, useEffect } from 'react';
import { Badge, Card, Collapse, Empty, List, Space, Spin, Tag, Typography, Progress } from 'antd';
import {
  RobotOutlined,
  SyncOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
} from '@ant-design/icons';
import { getExecutionMeta, formatTime } from '../../utils';

const { Panel } = Collapse;
const { Title, Text, Paragraph } = Typography;

// CLI 类型显示名称映射
const CLI_DISPLAY_NAMES = {
  'claude-code': 'Claude Code',
  'opencode': 'OpenCode',
};

// Agent 类型标签颜色
const CLI_TYPE_COLORS = {
  'claude-code': 'blue',
  'opencode': 'purple',
};

// 执行状态图标
function getStatusIcon(status) {
  switch (status) {
    case 'developing':
    case 'analyzing':
    case 'planning':
    case 'reviewing':
    case 'testing':
    case 'fixing':
    case 'committing':
      return <SyncOutlined spin style={{ color: '#0f766e' }} />;
    case 'completed':
      return <CheckCircleOutlined style={{ color: '#22c55e' }} />;
    case 'failed':
      return <ExclamationCircleOutlined style={{ color: '#ef4444' }} />;
    case 'queued':
      return <ClockCircleOutlined style={{ color: '#f59e0b' }} />;
    case 'idle':
      return <PauseCircleOutlined style={{ color: '#94a3b8' }} />;
    default:
      return <PlayCircleOutlined style={{ color: '#6b7280' }} />;
  }
}

// 任务状态统计
function getTaskStats(tasks) {
  const stats = {
    total: tasks.length,
    running: 0,
    queued: 0,
    completed: 0,
    failed: 0,
    idle: 0,
  };

  tasks.forEach(task => {
    switch (task.executionStatus) {
      case 'developing':
      case 'analyzing':
      case 'planning':
      case 'reviewing':
      case 'testing':
      case 'fixing':
      case 'committing':
        stats.running++;
        break;
      case 'queued':
        stats.queued++;
        break;
      case 'completed':
        stats.completed++;
        break;
      case 'failed':
        stats.failed++;
        break;
      default:
        stats.idle++;
    }
  });

  return stats;
}

function AgentMonitorPage({ agents, cliAgents, projects, onProjectSelect, onViewChange }) {
  const [loading, setLoading] = useState(true);
  const [agentTasks, setAgentTasks] = useState({});
  const [expandedAgents, setExpandedAgents] = useState([]);

  // 加载所有 Agent 的任务数据
  async function loadAgentTasks() {
    setLoading(true);
    try {
      const result = await window.vct.getAgentTasks();
      setAgentTasks(result || {});
      // 默认展开有任务的 Agent
      const agentsWithTasks = Object.keys(result || {}).filter(
        key => result[key]?.tasks?.length > 0
      );
      setExpandedAgents(agentsWithTasks);
    } catch (e) {
      console.error('Failed to load agent tasks:', e);
      setAgentTasks({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAgentTasks();
    // 定期刷新数据
    const interval = setInterval(loadAgentTasks, 5000);
    return () => clearInterval(interval);
  }, [agents, projects]);

  // 构建 Agent 列表（包含原生 CLI 和自定义 Agent）
  const allAgents = [
    // 原生 CLI Agents
    ...Object.entries(cliAgents || {}).map(([cliType, cliInfo]) => ({
      id: `cli-${cliType}`,
      name: CLI_DISPLAY_NAMES[cliType] || cliType,
      type: 'cli',
      cliType,
      installed: cliInfo.installed,
      version: cliInfo.version,
      isNative: true,
    })),
    // 自定义 Agents
    ...agents.map(agent => ({
      id: agent.id,
      name: agent.name,
      type: 'custom',
      cliType: agent.cliType,
      enabled: agent.enabled,
      description: agent.description,
      model: agent.model,
      isNative: false,
    })),
  ];

  // 渲染单个任务卡片
  function renderTaskCard(task, project) {
    const executionMeta = getExecutionMeta(task.executionStatus);
    const isRunning = [
      'developing', 'analyzing', 'planning', 'reviewing', 'testing', 'fixing', 'committing'
    ].includes(task.executionStatus);

    return (
      <List.Item
        key={task.id}
        className="agent-task-item"
        onClick={() => {
          if (project?.id) {
            onProjectSelect(project.id);
            onViewChange('workspace');
          }
        }}
      >
        <div className="agent-task-content">
          <div className="agent-task-header">
            <Space size={8}>
              {getStatusIcon(task.executionStatus)}
              <Text strong style={{ fontSize: 13 }}>{task.title}</Text>
            </Space>
            <Tag color={executionMeta.color} style={{ fontSize: 11 }}>
              {executionMeta.label}
            </Tag>
          </div>
          <div className="agent-task-meta">
            <Space size={16}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                项目: {project?.name || '未知'}
              </Text>
              {isRunning && task.boardStatus === 'in_progress' && (
                <Tag color="processing" icon={<SyncOutlined spin />}>
                  执行中
                </Tag>
              )}
              <Text type="secondary" style={{ fontSize: 12 }}>
                更新于 {formatTime(task.updatedAt)}
              </Text>
            </Space>
          </div>
          {task.description && (
            <Paragraph
              ellipsis={{ rows: 2 }}
              style={{ fontSize: 12, color: '#64748b', marginBottom: 0, marginTop: 8 }}
            >
              {task.description}
            </Paragraph>
          )}
          {task.lastError && (
            <div className="agent-task-error">
              <ExclamationCircleOutlined style={{ color: '#ef4444', marginRight: 6 }} />
              <Text type="danger" style={{ fontSize: 12 }}>{task.lastError}</Text>
            </div>
          )}
        </div>
      </List.Item>
    );
  }

  // 渲染 Agent 面板内容
  function renderAgentPanel(agent) {
    const agentData = agentTasks[agent.id] || { tasks: [], projects: [] };
    const tasks = agentData.tasks || [];
    const stats = getTaskStats(tasks);

    // 过滤出正在执行和即将执行的任务
    const activeTasks = tasks.filter(t =>
      ['developing', 'analyzing', 'planning', 'reviewing', 'testing', 'fixing', 'committing', 'queued'].includes(t.executionStatus)
    );
    const pendingTasks = tasks.filter(t =>
      t.executionStatus === 'idle' && t.boardStatus !== 'done'
    );

    return (
      <div className="agent-panel-content">
        {/* 统计概览 */}
        <div className="agent-stats-grid">
          <div className="agent-stat-item">
            <Text type="secondary" style={{ fontSize: 11 }}>执行中</Text>
            <Text strong style={{ fontSize: 18, color: '#0f766e' }}>{stats.running}</Text>
          </div>
          <div className="agent-stat-item">
            <Text type="secondary" style={{ fontSize: 11 }}>排队中</Text>
            <Text strong style={{ fontSize: 18, color: '#f59e0b' }}>{stats.queued}</Text>
          </div>
          <div className="agent-stat-item">
            <Text type="secondary" style={{ fontSize: 11 }}>待处理</Text>
            <Text strong style={{ fontSize: 18, color: '#64748b' }}>{stats.idle}</Text>
          </div>
          <div className="agent-stat-item">
            <Text type="secondary" style={{ fontSize: 11 }}>已完成</Text>
            <Text strong style={{ fontSize: 18, color: '#22c55e' }}>{stats.completed}</Text>
          </div>
        </div>

        {/* 正在执行的任务 */}
        {activeTasks.length > 0 && (
          <div className="agent-task-section">
            <Title level={5} style={{ marginBottom: 12, fontSize: 13 }}>
              <SyncOutlined spin style={{ marginRight: 8, color: '#0f766e' }} />
              正在执行 ({activeTasks.length})
            </Title>
            <List
              dataSource={activeTasks}
              renderItem={task => renderTaskCard(task, agentData.projects?.find(p => p.id === task.projectId))}
              split={false}
            />
          </div>
        )}

        {/* 即将执行的任务 */}
        {pendingTasks.length > 0 && (
          <div className="agent-task-section">
            <Title level={5} style={{ marginBottom: 12, fontSize: 13 }}>
              <ClockCircleOutlined style={{ marginRight: 8, color: '#f59e0b' }} />
              即将执行 ({pendingTasks.length})
            </Title>
            <List
              dataSource={pendingTasks.slice(0, 5)} // 只显示前5个
              renderItem={task => renderTaskCard(task, agentData.projects?.find(p => p.id === task.projectId))}
              split={false}
            />
            {pendingTasks.length > 5 && (
              <Text type="secondary" style={{ fontSize: 12, marginTop: 8 }}>
                还有 {pendingTasks.length - 5} 个任务等待执行...
              </Text>
            )}
          </div>
        )}

        {/* 无任务提示 */}
        {tasks.length === 0 && (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无分配到此 Agent 的任务"
            style={{ margin: '20px 0' }}
          />
        )}
      </div>
    );
  }

  // 渲染 Agent 头部信息
  function renderAgentHeader(agent) {
    const agentData = agentTasks[agent.id] || { tasks: [] };
    const runningCount = agentData.tasks?.filter(t =>
      ['developing', 'analyzing', 'planning', 'reviewing', 'testing', 'fixing', 'committing'].includes(t.executionStatus)
    ).length || 0;

    return (
      <div className="agent-header">
        <Space size={12}>
          <RobotOutlined style={{ fontSize: 18, color: 'var(--accent)' }} />
          <div className="agent-header-info">
            <Text strong style={{ fontSize: 14 }}>{agent.name}</Text>
            <Space size={8} style={{ marginLeft: 8 }}>
              <Tag color={CLI_TYPE_COLORS[agent.cliType] || 'default'} style={{ fontSize: 11 }}>
                {agent.cliType}
              </Tag>
              {agent.isNative ? (
                <Tag color={agent.installed ? 'success' : 'error'} style={{ fontSize: 11 }}>
                  {agent.installed ? `v${agent.version || '?'}` : '未安装'}
                </Tag>
              ) : (
                <Tag color={agent.enabled ? 'success' : 'default'} style={{ fontSize: 11 }}>
                  {agent.enabled ? '已启用' : '已禁用'}
                </Tag>
              )}
              {!agent.isNative && agent.model && (
                <Text type="secondary" style={{ fontSize: 11 }}>模型: {agent.model}</Text>
              )}
            </Space>
          </div>
        </Space>
        {runningCount > 0 && (
          <Badge count={runningCount} style={{ backgroundColor: '#0f766e' }} />
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <Card className="hero-card">
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
          <Text type="secondary" style={{ marginTop: 16, display: 'block' }}>
            正在加载 Agent 任务状态...
          </Text>
        </div>
      </Card>
    );
  }

  return (
    <div className="agent-monitor-page">
      <Card className="hero-card" title="">
        <Paragraph type="secondary" style={{ marginBottom: 16 }}>
          查看所有 Agent（原生 CLI 和自定义配置）正在执行或即将执行的任务。
          点击任务可跳转到对应项目工作台。
        </Paragraph>

        {/* 全局统计 */}
        <div className="global-stats-bar">
          <Space size={24}>
            <div className="global-stat">
              <SyncOutlined spin style={{ color: '#0f766e', marginRight: 6 }} />
              <Text>执行中: <Text strong style={{ color: '#0f766e' }}>
                {Object.values(agentTasks).reduce((sum, a) =>
                  sum + (a.tasks?.filter(t =>
                    ['developing', 'analyzing', 'planning', 'reviewing', 'testing', 'fixing', 'committing'].includes(t.executionStatus)
                  ).length || 0), 0
                )}
              </Text></Text>
            </div>
            <div className="global-stat">
              <ClockCircleOutlined style={{ color: '#f59e0b', marginRight: 6 }} />
              <Text>排队中: <Text strong style={{ color: '#f59e0b' }}>
                {Object.values(agentTasks).reduce((sum, a) =>
                  sum + (a.tasks?.filter(t => t.executionStatus === 'queued').length || 0), 0
                )}
              </Text></Text>
            </div>
            <div className="global-stat">
              <PlayCircleOutlined style={{ color: '#64748b', marginRight: 6 }} />
              <Text>待处理: <Text strong style={{ color: '#64748b' }}>
                {Object.values(agentTasks).reduce((sum, a) =>
                  sum + (a.tasks?.filter(t => t.executionStatus === 'idle' && t.boardStatus !== 'done').length || 0), 0
                )}
              </Text></Text>
            </div>
          </Space>
        </div>

        {/* Agent 列表 */}
        {allAgents.length === 0 ? (
          <Empty
            description="还没有配置任何 Agent"
            style={{ margin: '40px 0' }}
          />
        ) : (
          <Collapse
            accordion
            activeKey={expandedAgents}
            onChange={(keys) => setExpandedAgents(keys)}
            className="agent-collapse"
          >
            {allAgents.map(agent => (
              <Panel
                key={agent.id}
                header={renderAgentHeader(agent)}
                className="agent-panel"
              >
                {renderAgentPanel(agent)}
              </Panel>
            ))}
          </Collapse>
        )}
      </Card>
    </div>
  );
}

export default AgentMonitorPage;