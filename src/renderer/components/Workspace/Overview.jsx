import React from 'react';
import { Button, Card, Descriptions, Progress, Space, Tag, Typography } from 'antd';
import { BugOutlined, DownOutlined, PlusOutlined, RightOutlined, PauseCircleOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { MetricTile } from '../common/UIComponents';
import { getExecutionMeta, getProjectMeta, formatTime } from '../../utils';

const { Title, Text } = Typography;

function Overview({
  project,
  progress,
  tasks,
  bugs,
  collapsed,
  onToggleCollapse,
  onStart,
  onPause,
  onCreateTask,
  onCreateBug,
}) {
  const completionStats = React.useMemo(() => {
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

  const bugStats = React.useMemo(() => {
    if (!bugs) return { total: 0, open: 0 };
    const openCount = bugs.filter((bug) => bug.boardStatus !== 'done').length;
    return {
      total: bugs.length,
      open: openCount,
    };
  }, [bugs]);

  const activeTaskTitle = React.useMemo(() => {
    if (!progress?.currentTaskId) return '暂无';
    return tasks.find((task) => task.id === progress.currentTaskId)?.title || progress.currentTaskId;
  }, [progress, tasks]);

  const projectStatus = project ? getProjectMeta(project.status) : getProjectMeta();
  const currentPhaseMeta = getExecutionMeta(progress?.currentPhase);

  return (
    <Card
      className="hero-card"
      title={
        <div
          className="space-between full-width"
          style={{ cursor: 'pointer', paddingRight: 8 }}
          onClick={onToggleCollapse}
        >
          <span>项目概览</span>
          {collapsed ? (
            <RightOutlined style={{ fontSize: 12, color: 'var(--text-soft)' }} />
          ) : (
            <DownOutlined style={{ fontSize: 12, color: 'var(--text-soft)' }} />
          )}
        </div>
      }
      extra={(
        <Space>
          <Button icon={<PlusOutlined />} onClick={onCreateTask}>
            新建需求
          </Button>
          <Button icon={<BugOutlined />} onClick={onCreateBug}>
            提交 Bug
          </Button>
          {project.status === 'running' ? (
            <Button danger icon={<PauseCircleOutlined />} onClick={onPause}>
              暂停
            </Button>
          ) : (
            <Button type="primary" icon={<PlayCircleOutlined />} onClick={onStart}>
              开始
            </Button>
          )}
        </Space>
      )}
    >
      {!collapsed && (
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
              label="待修复 Bug"
              value={bugStats.open}
              hint={bugStats.open ? '待处理的 Bug' : '暂无 Bug'}
              tone={bugStats.open ? 'error' : 'neutral'}
            />
          </div>
          <div className="progress-block">
            <div className="progress-copy">
              <Text strong>整体进度</Text>
              <Text type="secondary">当前任务：{activeTaskTitle}</Text>
            </div>
            <div className="progress-value">{completionStats.percent}%</div>
          </div>
          <Progress
            percent={completionStats.percent}
            strokeColor="#14b8a6"
            trailColor="rgba(20, 184, 166, 0.14)"
            style={{ marginTop: 12 }}
          />
          <Descriptions column={1} size="small" className="project-description">
            <Descriptions.Item label="工作目录">{project.workDir}</Descriptions.Item>
            <Descriptions.Item label="CLI Agent">{project.agent}</Descriptions.Item>
            <Descriptions.Item label="当前任务">{activeTaskTitle}</Descriptions.Item>
            <Descriptions.Item label="当前阶段">{progress?.currentPhase || '未启动'}</Descriptions.Item>
            <Descriptions.Item label="最近运行">{formatTime(progress?.lastRunAt)}</Descriptions.Item>
          </Descriptions>
        </>
      )}
    </Card>
  );
}

export default Overview;