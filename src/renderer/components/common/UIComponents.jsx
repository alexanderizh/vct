import React from 'react';
import { Typography } from 'antd';

const { Title, Paragraph, Text } = Typography;

// 任务详情区块
export function TaskDetailSection({ title, content }) {
  return (
    <div className="detail-section">
      <Title level={5}>{title}</Title>
      {content ? (
        <Paragraph className="detail-content">{content}</Paragraph>
      ) : (
        <Text type="secondary">暂无内容</Text>
      )}
    </div>
  );
}

// 环境状态卡片
export function EnvironmentStatusCard({ title, installed, summary, details }) {
  return (
    <div className={`env-status-card ${installed ? 'is-ready' : 'is-error'}`}>
      <div className="env-status-head">
        <div className={`env-dot ${installed ? 'is-ready' : 'is-error'}`} />
        <div>
          <Text strong>{title}</Text>
          <div className="env-summary">{summary}</div>
        </div>
      </div>
      <Paragraph className="env-details">
        {details || '暂无更多信息'}
      </Paragraph>
    </div>
  );
}

// 指标卡片
export function MetricTile({ label, value, hint, tone }) {
  return (
    <div className={`metric-tile ${tone ? `tone-${tone}` : ''}`}>
      <Text className="metric-label">{label}</Text>
      <div className="metric-value">{value}</div>
      <Text className="metric-hint">{hint}</Text>
    </div>
  );
}

// 导航按钮
export function NavButton({ active, icon, label, onClick, collapsed }) {
  return (
    <button
      type="button"
      className={active ? 'nav-button is-active' : 'nav-button'}
      onClick={onClick}
      title={collapsed ? label : undefined}
    >
      {icon}
      {!collapsed && <span>{label}</span>}
    </button>
  );
}