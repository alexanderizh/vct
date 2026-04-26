import React from 'react';
import { Button, Space, Tag, Typography, Layout } from 'antd';
import { EditOutlined, ReloadOutlined } from '@ant-design/icons';
import { getExecutionMeta, getProjectMeta } from '../../utils';

const { Header } = Layout;
const { Title, Text } = Typography;

function AppHeader({
  activeView,
  selectedProject,
  progress,
  onEditProject,
  onRefreshEnvironment,
}) {
  const selectedProjectStatus = selectedProject ? getProjectMeta(selectedProject.status) : getProjectMeta();
  const currentPhaseMeta = getExecutionMeta(progress?.currentPhase);

  const activeTaskTitle = React.useMemo(() => {
    if (!progress?.currentTaskId) return '暂无';
    // Task title needs to be passed from parent
    return progress.currentTaskTitle || progress.currentTaskId;
  }, [progress]);

  if (activeView === 'environment') {
    return (
      <Header className="top-header">
        <div className="header-bar">
          <div className="header-copy">
            <Title level={4} style={{ marginBottom: 0 }}>本地环境</Title>
            <Text type="secondary">集中查看 Claude Code、Git 以及后续扩展的运行依赖</Text>
          </div>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={onRefreshEnvironment}>
              重新检查
            </Button>
          </Space>
        </div>
      </Header>
    );
  }

  if (activeView === 'agents') {
    return (
      <Header className="top-header">
        <div className="header-bar">
          <div className="header-copy">
            <Title level={4} style={{ marginBottom: 0 }}>Agent 管理</Title>
            <Text type="secondary">管理自定义 CLI Agent 配置，为不同任务指定不同的执行策略</Text>
          </div>
        </div>
      </Header>
    );
  }

  if (activeView === 'agent-monitor') {
    return (
      <Header className="top-header">
        <div className="header-bar">
          <div className="header-copy">
            <Title level={4} style={{ marginBottom: 0 }}>Agent 任务监控</Title>
            <Text type="secondary">查看所有 Agent 正在执行或即将执行的任务</Text>
          </div>
        </div>
      </Header>
    );
  }

  if (activeView === 'bugs') {
    return (
      <Header className="top-header">
        <div className="header-bar">
          <div className="header-copy">
            <Title level={4} style={{ marginBottom: 0 }}>Bug 看板</Title>
            <Text type="secondary">管理和修复项目中的 Bug</Text>
          </div>
        </div>
      </Header>
    );
  }

  if (selectedProject) {
    return (
      <Header className="top-header">
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
            <Button icon={<EditOutlined />} onClick={() => onEditProject(selectedProject)}>
              项目设置
            </Button>
          </Space>
        </div>
      </Header>
    );
  }

  return (
    <Header className="top-header">
      <Title level={4} style={{ marginBottom: 0 }}>选择或创建项目</Title>
    </Header>
  );
}

export default AppHeader;