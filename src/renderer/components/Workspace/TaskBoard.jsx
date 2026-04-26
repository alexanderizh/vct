import React from 'react';
import { Card, Empty, Input, Select, Typography } from 'antd';
import TaskCard from './TaskCard';

const { Text } = Typography;

function TaskBoard({
  tasks,
  activeTaskId,
  draggingTaskId,
  boardSearchText,
  boardStatusFilter,
  onSearchChange,
  onStatusFilterChange,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onTaskClick,
  onTaskEdit,
  onTaskDelete,
  onTaskStatusChange,
  onMoveToFirst,
}) {
  const filteredTasks = tasks.filter((task) => {
    if (boardStatusFilter !== 'all' && task.boardStatus !== boardStatusFilter) return false;
    if (boardSearchText) {
      const keyword = boardSearchText.toLowerCase();
      return task.title.toLowerCase().includes(keyword) ||
        (task.description || '').toLowerCase().includes(keyword);
    }
    return true;
  });

  return (
    <Card
      title="需求看板"
      extra={<Text type="secondary">拖拽排序，点击卡片查看详情</Text>}
    >
      <div className="board-filter-bar">
        <Input.Search
          placeholder="搜索需求标题或描述"
          allowClear
          value={boardSearchText}
          onChange={(e) => onSearchChange(e.target.value)}
          style={{ width: 260 }}
        />
        <Select
          value={boardStatusFilter}
          onChange={onStatusFilterChange}
          style={{ width: 140 }}
          options={[
            { value: 'all', label: '全部状态' },
            { value: 'todo', label: '待处理' },
            { value: 'in_progress', label: '进行中' },
            { value: 'blocked', label: '阻塞' },
            { value: 'suspended', label: '已挂起' },
            { value: 'done', label: '已完成' },
          ]}
        />
      </div>
      {tasks.length === 0 ? (
        <Empty description="还没有需求，点击右上角创建" />
      ) : (
        <div className="task-board">
          {filteredTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              isActive={activeTaskId === task.id}
              isDragging={draggingTaskId === task.id}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
              onClick={() => onTaskClick(task)}
              onEdit={onTaskEdit}
              onDelete={onTaskDelete}
              onStatusChange={onTaskStatusChange}
              onMoveToFirst={onMoveToFirst}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

export default TaskBoard;