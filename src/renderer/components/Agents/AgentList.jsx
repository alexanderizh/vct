import React from 'react';
import { Button, Card, Empty, List, Popconfirm, Space, Tag, Typography, Tooltip } from 'antd';
import { DeleteOutlined, EditOutlined, RobotOutlined, CheckCircleOutlined } from '@ant-design/icons';

const { Paragraph, Text } = Typography;

// 阶段名称映射
const PHASE_NAMES = {
  analyze: '分析',
  plan: '计划',
  develop: '开发',
  review: '审查',
  test: '测试',
  fix: '修复',
  commit: '提交',
  execute: '执行',
};

function AgentList({ agents, onEdit, onDelete }) {
  return (
    <Card
      className="hero-card"
      title="Agent 管理"
      extra={
        <Button type="primary" icon={<RobotOutlined />} onClick={() => onEdit(null)}>
          新建 Agent
        </Button>
      }
    >
      <Paragraph type="secondary" style={{ marginBottom: 16 }}>
        Agent 是基于 CLI 的自定义执行配置，可以为不同的任务指定不同的系统提示词、模型和 API 地址。
      </Paragraph>
      <List
        dataSource={agents}
        locale={{ emptyText: <Empty description="还没有创建 Agent" /> }}
        renderItem={(agent) => (
          <List.Item
            actions={[
              <Button key="edit" type="link" icon={<EditOutlined />} onClick={() => onEdit(agent)}>
                编辑
              </Button>,
              <Popconfirm
                key="delete"
                title="确定删除此 Agent？"
                onConfirm={() => onDelete(agent.id)}
              >
                <Button type="link" danger icon={<DeleteOutlined />}>
                  删除
                </Button>
              </Popconfirm>,
            ]}
          >
            <List.Item.Meta
              avatar={<RobotOutlined style={{ fontSize: 24, color: 'var(--accent)' }} />}
              title={
                <Space>
                  <span>{agent.name}</span>
                  <Tag color={agent.enabled ? 'success' : 'default'}>
                    {agent.enabled ? '已启用' : '已禁用'}
                  </Tag>
                  <Tag color="blue">{agent.cliType}</Tag>
                  {agent.useCustomWorkflow && (
                    <Tag color="purple">自定义流程</Tag>
                  )}
                </Space>
              }
              description={
                <Space direction="vertical" size={4}>
                  <Text type="secondary">{agent.description || '暂无描述'}</Text>
                  <Space size={8}>
                    {agent.model && <Text code>模型: {agent.model}</Text>}
                    {agent.apiBaseUrl && <Text code>API: {agent.apiBaseUrl}</Text>}
                    <Text type="secondary">最大轮次: {agent.maxTurns}</Text>
                  </Space>
                  {agent.useCustomWorkflow && agent.workflow && (
                    <div style={{ marginTop: 4 }}>
                      <Text type="secondary" style={{ marginRight: 8 }}>工作流程:</Text>
                      {agent.workflow.map((phase, index) => (
                        <Tag key={index} style={{ marginRight: 4, marginBottom: 2 }}>
                          {PHASE_NAMES[phase] || phase}
                        </Tag>
                      ))}
                      {agent.autoCommit && (
                        <Tooltip title="有代码变更时自动提交">
                          <Tag color="green" icon={<CheckCircleOutlined />} style={{ marginLeft: 4 }}>
                            自动提交
                          </Tag>
                        </Tooltip>
                      )}
                    </div>
                  )}
                </Space>
              }
            />
          </List.Item>
        )}
      />
    </Card>
  );
}

export default AgentList;