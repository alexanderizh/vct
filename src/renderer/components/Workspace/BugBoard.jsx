import React from 'react';
import { Button, Card, Empty, Input, Select, Space, Typography } from 'antd';
import { BugOutlined, PlayCircleOutlined, PauseCircleOutlined } from '@ant-design/icons';
import BugCard from './BugCard';

const { Text } = Typography;

function BugBoard({
  bugs,
  activeBugId,
  draggingBugId,
  boardSearchText,
  boardStatusFilter,
  severityFilter,
  sourceFilter,
  isFixingAll,
  onSearchChange,
  onStatusFilterChange,
  onSeverityFilterChange,
  onSourceFilterChange,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onBugClick,
  onBugEdit,
  onBugDelete,
  onBugStatusChange,
  onMoveToFirst,
  onFixSingle,
  onFixAll,
  onPauseFix,
}) {
  const filteredBugs = bugs.filter((bug) => {
    if (boardStatusFilter !== 'all' && bug.boardStatus !== boardStatusFilter) return false;
    if (severityFilter !== 'all' && bug.severity !== severityFilter) return false;
    if (sourceFilter !== 'all' && bug.source !== sourceFilter) return false;
    if (boardSearchText) {
      const keyword = boardSearchText.toLowerCase();
      return bug.title.toLowerCase().includes(keyword) ||
        (bug.description || '').toLowerCase().includes(keyword);
    }
    return true;
  });

  const todoCount = bugs.filter(b => b.boardStatus !== 'done').length;

  return (
    <Card
      title={
        <Space>
          <BugOutlined />
          <span>Bug 看板</span>
          {todoCount > 0 && <Text type="secondary">({todoCount} 个待修复)</Text>}
        </Space>
      }
      extra={
        <Space>
          <Text type="secondary">拖拽排序，点击卡片查看详情</Text>
          {isFixingAll ? (
            <Button
              type="primary"
              danger
              icon={<PauseCircleOutlined />}
              onClick={onPauseFix}
            >
              暂停修复
            </Button>
          ) : (
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={onFixAll}
              disabled={todoCount === 0}
            >
              一键修复全部
            </Button>
          )}
        </Space>
      }
    >
      <div className="board-filter-bar">
        <Input.Search
          placeholder="搜索 Bug 标题或描述"
          allowClear
          value={boardSearchText}
          onChange={(e) => onSearchChange(e.target.value)}
          style={{ width: 200 }}
        />
        <Select
          value={boardStatusFilter}
          onChange={onStatusFilterChange}
          style={{ width: 120 }}
          options={[
            { value: 'all', label: '全部状态' },
            { value: 'todo', label: '待处理' },
            { value: 'in_progress', label: '进行中' },
            { value: 'blocked', label: '阻塞' },
            { value: 'suspended', label: '已挂起' },
            { value: 'done', label: '已完成' },
          ]}
        />
        <Select
          value={severityFilter}
          onChange={onSeverityFilterChange}
          style={{ width: 120 }}
          options={[
            { value: 'all', label: '全部严重程度' },
            { value: 'low', label: '低' },
            { value: 'medium', label: '中' },
            { value: 'high', label: '高' },
            { value: 'critical', label: '紧急' },
          ]}
        />
        <Select
          value={sourceFilter}
          onChange={onSourceFilterChange}
          style={{ width: 120 }}
          options={[
            { value: 'all', label: '全部来源' },
            { value: 'manual', label: '手动提交' },
            { value: 'code_review', label: '代码审查' },
            { value: 'testing', label: '功能测试' },
            { value: 'auto_detect', label: '自动检测' },
          ]}
        />
      </div>
      {bugs.length === 0 ? (
        <Empty description="还没有 Bug，点击右上角创建" />
      ) : (
        <div className="task-board">
          {filteredBugs.map((bug) => (
            <BugCard
              key={bug.id}
              bug={bug}
              isActive={activeBugId === bug.id}
              isDragging={draggingBugId === bug.id}
              isFixingAll={isFixingAll}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
              onClick={() => onBugClick(bug)}
              onEdit={onBugEdit}
              onDelete={onBugDelete}
              onStatusChange={onBugStatusChange}
              onMoveToFirst={onMoveToFirst}
              onFix={onFixSingle}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

export default BugBoard;