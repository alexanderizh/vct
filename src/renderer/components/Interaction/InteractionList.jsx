import React, { useMemo } from 'react';
import { Space, Empty, Typography } from 'antd';
import InteractionReply from './InteractionReply';

const { Text } = Typography;

/**
 * 交互列表组件
 * 显示任务的所有交互请求
 */
function InteractionList({ interactions, onSubmit, onCancel }) {
  // 使用 useMemo 优化性能
  const { pendingInteractions, completedInteractions } = useMemo(() => {
    if (!Array.isArray(interactions)) {
      return { pendingInteractions: [], completedInteractions: [] };
    }

    // 按时间倒序排列，待处理的在前面
    const sortedInteractions = [...interactions].sort((a, b) => {
      // 待处理的优先
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      // 按时间倒序
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });

    return {
      pendingInteractions: sortedInteractions.filter(i => i.status === 'pending'),
      completedInteractions: sortedInteractions.filter(i => i.status !== 'pending'),
    };
  }, [interactions]);

  if (pendingInteractions.length === 0 && completedInteractions.length === 0) {
    return <Empty description="暂无交互记录" />;
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      {/* 待处理的交互 */}
      {pendingInteractions.length > 0 && (
        <div>
          <Text type="warning" strong style={{ marginBottom: 8, display: 'block' }}>
            待处理 ({pendingInteractions.length})
          </Text>
          {pendingInteractions.map((interaction) => (
            <InteractionReply
              key={interaction.id}
              interaction={interaction}
              onSubmit={(answer) => onSubmit(interaction.id, answer)}
              onCancel={() => onCancel(interaction.id)}
            />
          ))}
        </div>
      )}

      {/* 已完成的交互 */}
      {completedInteractions.length > 0 && (
        <div>
          <Text type="secondary" strong style={{ marginBottom: 8, display: 'block' }}>
            历史交互 ({completedInteractions.length})
          </Text>
          {completedInteractions.map((interaction) => (
            <InteractionReply
              key={interaction.id}
              interaction={interaction}
              onSubmit={() => {}}
              onCancel={() => {}}
            />
          ))}
        </div>
      )}
    </Space>
  );
}

export default InteractionList;