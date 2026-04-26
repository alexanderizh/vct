import React from 'react';
import { Button, Card, Popconfirm, Select, Space, Tag, Typography } from 'antd';
import {
  BugOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  HolderOutlined,
  PlayCircleOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { getBoardMeta, getBugSeverityMeta, getBugSourceMeta, getBugExecutionMeta, formatTime } from '../../utils';

const { Title, Paragraph, Text } = Typography;

function BugCard({
  bug,
  isActive,
  isDragging,
  isFixingAll,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onClick,
  onEdit,
  onDelete,
  onStatusChange,
  onMoveToFirst,
  onFix,
}) {
  const boardMeta = getBoardMeta(bug.boardStatus);
  const severityMeta = getBugSeverityMeta(bug.severity);
  const sourceMeta = getBugSourceMeta(bug.source);
  const executionMeta = getBugExecutionMeta(bug.executionStatus);

  const isCompleted = bug.boardStatus === 'done';
  const isFixing = bug.executionStatus === 'analyzing' || bug.executionStatus === 'fixing' || bug.executionStatus === 'verifying';

  return (
    <div
      key={bug.id}
      draggable
      className={isDragging ? 'task-card-shell dragging' : 'task-card-shell'}
      onDragStart={() => onDragStart(bug.id)}
      onDragOver={onDragOver}
      onDrop={() => onDrop(bug.id)}
      onDragEnd={onDragEnd}
    >
      <Card
        className={isActive ? 'task-card is-active' : 'task-card'}
        onClick={onClick}
      >
        <div className="task-card-head">
          <Space wrap>
            <HolderOutlined className="drag-handle" />
            <Tag icon={<BugOutlined />} color={severityMeta.color}>{severityMeta.label}</Tag>
            <Tag color={boardMeta.color}>{boardMeta.label}</Tag>
            <Tag color={executionMeta.color}>{executionMeta.label}</Tag>
            <Tag color={sourceMeta.color}>{sourceMeta.label}</Tag>
          </Space>
          <Space>
            {!isCompleted && !isFixingAll && (
              <Button
                type="primary"
                size="small"
                icon={<PlayCircleOutlined />}
                title="修复此 Bug"
                onClick={(event) => {
                  event.stopPropagation();
                  onFix(bug.id);
                }}
              >
                修复
              </Button>
            )}
            <Button
              type="text"
              size="small"
              icon={<ThunderboltOutlined />}
              title="立即执行"
              onClick={(event) => {
                event.stopPropagation();
                onMoveToFirst(bug.id);
              }}
            />
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={(event) => {
                event.stopPropagation();
                onClick();
              }}
            />
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={(event) => {
                event.stopPropagation();
                onEdit(bug);
              }}
            />
            <Popconfirm
              title="确认删除此 Bug？"
              onConfirm={(event) => {
                event?.stopPropagation?.();
                onDelete(bug.id);
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
        <Title level={5} className="task-card-title">{bug.title}</Title>
        <Paragraph ellipsis={{ rows: 3 }} className="task-card-paragraph">
          {bug.description || '暂无 Bug 说明'}
        </Paragraph>
        <div className="task-card-footer">
          <div className="task-card-footer-left">
            <Text type="secondary" className="muted-line">
              更新于 {formatTime(bug.updatedAt)}
            </Text>
          </div>
          <Select
            size="small"
            value={bug.boardStatus}
            options={[
              { value: 'todo', label: '待处理' },
              { value: 'in_progress', label: '进行中' },
              { value: 'blocked', label: '阻塞' },
              { value: 'suspended', label: '已挂起' },
              { value: 'done', label: '已完成' },
            ]}
            onChange={(nextValue) => onStatusChange(bug.id, nextValue)}
            onClick={(event) => event.stopPropagation()}
            style={{ width: 148 }}
          />
        </div>
      </Card>
    </div>
  );
}

export default BugCard;