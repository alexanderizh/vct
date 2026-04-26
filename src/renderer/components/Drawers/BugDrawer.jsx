import React from 'react';
import { Button, Descriptions, Drawer, Empty, Space, Tag, Timeline, Typography } from 'antd';
import { BugOutlined, EditOutlined, PlayCircleOutlined, RobotOutlined, SaveOutlined } from '@ant-design/icons';
import { TaskDetailSection } from '../common/UIComponents';
import { getBoardMeta, getBugSeverityMeta, getBugSourceMeta, getBugExecutionMeta, formatTime } from '../../utils';

const { Title, Text, Paragraph } = Typography;

function BugDrawer({
  open,
  bug,
  agents,
  tasks,
  onClose,
  onEdit,
  onFix,
  onMarkComplete,
}) {
  const isCompleted = bug?.boardStatus === 'done';
  const isFixing = bug?.executionStatus === 'analyzing' || bug?.executionStatus === 'fixing' || bug?.executionStatus === 'verifying';

  return (
    <Drawer
      title={
        <Space>
          <BugOutlined />
          <span>{bug?.title || 'Bug 详情'}</span>
        </Space>
      }
      width="90%"
      open={open}
      onClose={onClose}
      extra={bug ? (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => onEdit(bug)}>编辑</Button>
          {!isCompleted && !isFixing && (
            <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => onFix(bug.id)}>修复</Button>
          )}
          {!isCompleted && (
            <Button icon={<SaveOutlined />} onClick={() => onMarkComplete(bug.id)}>标记完成</Button>
          )}
        </Space>
      ) : null}
    >
      {bug ? (
        <Space direction="vertical" size={20} style={{ width: '100%' }}>
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="严重程度">
              <Tag color={getBugSeverityMeta(bug.severity).color}>{getBugSeverityMeta(bug.severity).label}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Bug 来源">
              <Tag color={getBugSourceMeta(bug.source).color}>{getBugSourceMeta(bug.source).label}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="看板状态">
              <Tag color={getBoardMeta(bug.boardStatus).color}>{getBoardMeta(bug.boardStatus).label}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="执行状态">
              <Tag color={getBugExecutionMeta(bug.executionStatus).color}>{getBugExecutionMeta(bug.executionStatus).label}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="修复 Agent">
              {bug.agentId ? (
                <Space>
                  <RobotOutlined />
                  <span>{agents.find((a) => a.id === bug.agentId)?.name || bug.agentId}</span>
                </Space>
              ) : (
                <Text type="secondary">使用项目默认 CLI</Text>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="关联需求">
              {bug.relatedTaskId ? (
                <Text>{tasks.find((t) => t.id === bug.relatedTaskId)?.title || bug.relatedTaskId}</Text>
              ) : (
                <Text type="secondary">无</Text>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">{formatTime(bug.createdAt)}</Descriptions.Item>
            <Descriptions.Item label="最近更新">{formatTime(bug.updatedAt)}</Descriptions.Item>
          </Descriptions>

          <TaskDetailSection title="Bug 描述" content={bug.description} />
          <TaskDetailSection title="涉及文件" content={bug.filepaths?.join('\n')} emptyText="未指定" />
          <TaskDetailSection title="复现步骤" content={bug.reproductionSteps} emptyText="未提供" />
          <TaskDetailSection title="错误堆栈" content={bug.stackTrace} emptyText="无" />
          <TaskDetailSection title="Bug 分析" content={bug.analysis} />
          <TaskDetailSection title="修复结果" content={bug.fixResult} />
          <TaskDetailSection title="错误信息" content={bug.lastError} />

          <div className="detail-section">
            <Title level={5}>历史执行记录</Title>
            {bug.history?.length ? (
              <Timeline
                items={bug.history.map((entry) => ({
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
        <Empty description="选择一个 Bug 查看详情" />
      )}
    </Drawer>
  );
}

export default BugDrawer;