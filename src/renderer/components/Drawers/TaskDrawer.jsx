import React, { useState, useEffect } from 'react';
import { Button, Descriptions, Drawer, Empty, Space, Tag, Timeline, Typography, Tabs, Badge } from 'antd';
import { EditOutlined, RobotOutlined, SaveOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { TaskDetailSection } from '../common/UIComponents';
import { getBoardMeta, getExecutionMeta, formatTime } from '../../utils';
import { InteractionList } from '../Interaction';

const { Title, Text, Paragraph } = Typography;

function TaskDrawer({
  open,
  task,
  agents,
  onClose,
  onEdit,
  onMarkComplete,
  onSubmitInteraction,
  onCancelInteraction,
}) {
  const [activeTab, setActiveTab] = useState('details');

  // 获取交互记录
  const interactions = task?.history?.filter(h => h.type === 'interaction') || [];
  const pendingInteractions = interactions.filter(i => i.status === 'pending');

  // 有待处理交互时自动切换到交互标签页
  useEffect(() => {
    if (pendingInteractions.length > 0 && open) {
      setActiveTab('interactions');
    }
  }, [pendingInteractions.length, open]);

  // 处理交互提交
  const handleSubmitInteraction = async (interactionId, answer) => {
    if (onSubmitInteraction && task?.id) {
      await onSubmitInteraction(task.id, interactionId, answer);
    }
  };

  // 处理交互取消
  const handleCancelInteraction = async (interactionId) => {
    if (onCancelInteraction && task?.id) {
      await onCancelInteraction(task.id, interactionId);
    }
  };

  // 渲染详情标签页内容
  const renderDetails = () => (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label="优先级">{task?.priority || 'medium'}</Descriptions.Item>
        <Descriptions.Item label="看板状态">
          <Tag color={getBoardMeta(task?.boardStatus).color}>{getBoardMeta(task?.boardStatus).label}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="执行状态">
          <Tag color={getExecutionMeta(task?.executionStatus).color}>{getExecutionMeta(task?.executionStatus).label}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="执行 Agent">
          {task?.agentId ? (
            <Space>
              <RobotOutlined />
              <span>{agents.find((a) => a.id === task.agentId)?.name || task.agentId}</span>
            </Space>
          ) : (
            <Text type="secondary">使用项目默认 CLI</Text>
          )}
        </Descriptions.Item>
        <Descriptions.Item label="提交记录">{task?.commitHash || '暂无'}</Descriptions.Item>
        <Descriptions.Item label="最近更新时间">{formatTime(task?.updatedAt)}</Descriptions.Item>
      </Descriptions>

      <TaskDetailSection title="需求描述" content={task?.description} />
      <TaskDetailSection title="需求分析" content={task?.analysis} />
      <TaskDetailSection title="开发计划" content={task?.plan} />
      <TaskDetailSection title="代码审查" content={task?.reviewResult} />
      <TaskDetailSection title="测试结果" content={task?.testResult} />
      <TaskDetailSection title="错误信息" content={task?.lastError} />
    </Space>
  );

  // 渲染交互标签页内容
  const renderInteractions = () => (
    <InteractionList
      interactions={interactions}
      onSubmit={handleSubmitInteraction}
      onCancel={handleCancelInteraction}
    />
  );

  // 渲染历史标签页内容
  const renderHistory = () => {
    // 过滤掉交互类型的记录（交互在单独的标签页显示）
    const historyEntries = task?.history?.filter(h => h.type !== 'interaction' && h.type !== 'interaction_answered') || [];

    if (historyEntries.length === 0) {
      return <Empty description="暂无历史记录" />;
    }

    return (
      <Timeline
        items={historyEntries.map((entry) => ({
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
    );
  };

  // 标签页配置
  const tabItems = [
    {
      key: 'details',
      label: '详情',
      children: renderDetails(),
    },
    {
      key: 'interactions',
      label: (
        <span>
          <QuestionCircleOutlined style={{ marginRight: 4 }} />
          交互
          {pendingInteractions.length > 0 && (
            <Badge count={pendingInteractions.length} style={{ marginLeft: 4 }} />
          )}
        </span>
      ),
      children: renderInteractions(),
    },
    {
      key: 'history',
      label: '历史',
      children: renderHistory(),
    },
  ];

  return (
    <Drawer
      title={task?.title || '任务详情'}
      width="90%"
      open={open}
      onClose={onClose}
      extra={task ? (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => onEdit(task)}>编辑</Button>
          <Button icon={<SaveOutlined />} onClick={() => onMarkComplete(task.id)}>标记完成</Button>
        </Space>
      ) : null}
    >
      {task ? (
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
        />
      ) : (
        <Empty description="选择一个任务查看详情" />
      )}
    </Drawer>
  );
}

export default TaskDrawer;