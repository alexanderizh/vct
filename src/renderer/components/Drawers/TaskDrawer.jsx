import React from 'react';
import { Button, Descriptions, Drawer, Empty, Space, Tag, Timeline, Typography } from 'antd';
import { EditOutlined, RobotOutlined, SaveOutlined } from '@ant-design/icons';
import { TaskDetailSection } from '../common/UIComponents';
import { getBoardMeta, getExecutionMeta, formatTime } from '../../utils';

const { Title, Text, Paragraph } = Typography;

function TaskDrawer({
  open,
  task,
  agents,
  onClose,
  onEdit,
  onMarkComplete,
}) {
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
        <Space direction="vertical" size={20} style={{ width: '100%' }}>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="优先级">{task.priority}</Descriptions.Item>
            <Descriptions.Item label="看板状态">
              <Tag color={getBoardMeta(task.boardStatus).color}>{getBoardMeta(task.boardStatus).label}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="执行状态">
              <Tag color={getExecutionMeta(task.executionStatus).color}>{getExecutionMeta(task.executionStatus).label}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="执行 Agent">
              {task.agentId ? (
                <Space>
                  <RobotOutlined />
                  <span>{agents.find((a) => a.id === task.agentId)?.name || task.agentId}</span>
                </Space>
              ) : (
                <Text type="secondary">使用项目默认 CLI</Text>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="提交记录">{task.commitHash || '暂无'}</Descriptions.Item>
            <Descriptions.Item label="最近更新时间">{formatTime(task.updatedAt)}</Descriptions.Item>
          </Descriptions>

          <TaskDetailSection title="需求描述" content={task.description} />
          <TaskDetailSection title="需求分析" content={task.analysis} />
          <TaskDetailSection title="开发计划" content={task.plan} />
          <TaskDetailSection title="代码审查" content={task.reviewResult} />
          <TaskDetailSection title="测试结果" content={task.testResult} />
          <TaskDetailSection title="错误信息" content={task.lastError} />

          <div className="detail-section">
            <Title level={5}>历史执行记录</Title>
            {task.history?.length ? (
              <Timeline
                items={task.history.map((entry) => ({
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
  );
}

export default TaskDrawer;