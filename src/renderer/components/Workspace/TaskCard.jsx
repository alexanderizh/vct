import React from 'react';
import { Button, Card, Popconfirm, Select, Space, Tag, Typography } from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  HolderOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { getBoardMeta, getExecutionMeta, getPriorityMeta, formatTime } from '../../utils';

const { Title, Paragraph, Text } = Typography;

function TaskCard({
  task,
  isActive,
  isDragging,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onClick,
  onEdit,
  onDelete,
  onStatusChange,
  onMoveToFirst,
}) {
  // 防止 task 为 null 时崩溃
  if (!task) return null;

  const boardMeta = getBoardMeta(task.boardStatus);
  const executionMeta = getExecutionMeta(task.executionStatus);
  const priorityMeta = getPriorityMeta(task.priority);

  return (
    <div
      key={task.id}
      draggable
      className={isDragging ? 'task-card-shell dragging' : 'task-card-shell'}
      onDragStart={() => onDragStart(task.id)}
      onDragOver={onDragOver}
      onDrop={() => onDrop(task.id)}
      onDragEnd={onDragEnd}
    >
      <Card
        className={isActive ? 'task-card is-active' : 'task-card'}
        onClick={onClick}
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
                onMoveToFirst(task.id);
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
                onEdit(task);
              }}
            />
            <Popconfirm
              title="确认删除需求？"
              onConfirm={(event) => {
                event?.stopPropagation?.();
                onDelete(task.id);
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
            options={[
              { value: 'todo', label: '待处理' },
              { value: 'in_progress', label: '进行中' },
              { value: 'blocked', label: '阻塞' },
              { value: 'suspended', label: '已挂起' },
              { value: 'done', label: '已完成' },
            ]}
            onChange={(nextValue) => onStatusChange(task.id, nextValue)}
            onClick={(event) => event.stopPropagation()}
            style={{ width: 148 }}
          />
        </div>
      </Card>
    </div>
  );
}

export default TaskCard;