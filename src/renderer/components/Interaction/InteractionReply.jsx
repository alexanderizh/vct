import React, { useState } from 'react';
import { Button, Card, Input, Radio, Space, Typography, Alert, Tag } from 'antd';
import { CheckOutlined, CloseOutlined, QuestionCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

/**
 * 交互回复组件
 * 用于显示需要用户确认的交互请求
 */
function InteractionReply({ interaction, onSubmit, onCancel, loading = false }) {
  const [answer, setAnswer] = useState(interaction?.defaultValue || '');
  const [submitting, setSubmitting] = useState(false);

  // 防御性检查 - 在 hooks 之后检查
  if (!interaction || typeof interaction !== 'object') {
    return (
      <Card style={{ marginBottom: 16 }}>
        <Alert type="error" message="交互数据格式错误" />
      </Card>
    );
  }

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(answer);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirm = async (value) => {
    setSubmitting(true);
    try {
      await onSubmit(value);
    } finally {
      setSubmitting(false);
    }
  };

  // 根据交互类型渲染不同的输入组件
  const renderInput = () => {
    switch (interaction.interactionType) {
      case 'confirm':
        return (
          <Space>
            <Button
              type="primary"
              icon={<CheckOutlined />}
              loading={submitting}
              onClick={() => handleConfirm('allow')}
            >
              确认执行
            </Button>
            <Button
              danger
              icon={<CloseOutlined />}
              loading={submitting}
              onClick={() => handleConfirm('deny')}
            >
              拒绝
            </Button>
          </Space>
        );

      case 'choice':
        return (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Radio.Group
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              style={{ width: '100%' }}
            >
              <Space direction="vertical">
                {(interaction.options || []).map((opt) => (
                  <Radio key={opt.value} value={opt.value}>
                    <Space direction="vertical" size={0}>
                      <Text strong>{opt.label}</Text>
                      {opt.description && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {opt.description}
                        </Text>
                      )}
                    </Space>
                  </Radio>
                ))}
              </Space>
            </Radio.Group>
            <Button type="primary" loading={submitting} onClick={handleSubmit}>
              提交选择
            </Button>
          </Space>
        );

      case 'input':
        return (
          <Space.Compact style={{ width: '100%' }}>
            <Input
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder={interaction.placeholder || '请输入...'}
              onPressEnter={handleSubmit}
              style={{ flex: 1 }}
            />
            <Button type="primary" loading={submitting} onClick={handleSubmit}>
              提交
            </Button>
          </Space.Compact>
        );

      default:
        return (
          <Space>
            <Button type="primary" onClick={() => handleConfirm(true)}>
              确认
            </Button>
            <Button onClick={() => handleConfirm(false)}>
              取消
            </Button>
          </Space>
        );
    }
  };

  // 根据状态渲染不同的样式
  const getStatusColor = () => {
    switch (interaction.status) {
      case 'pending':
        return '#faad14';
      case 'answered':
        return '#52c41a';
      case 'timeout':
        return '#ff4d4f';
      case 'cancelled':
        return '#d9d9d9';
      default:
        return '#faad14';
    }
  };

  const getStatusTag = () => {
    switch (interaction.status) {
      case 'pending':
        return <Tag icon={<ClockCircleOutlined />} color="warning">等待回复</Tag>;
      case 'answered':
        return <Tag icon={<CheckOutlined />} color="success">已回复</Tag>;
      case 'timeout':
        return <Tag color="error">已超时</Tag>;
      case 'cancelled':
        return <Tag color="default">已取消</Tag>;
      default:
        return null;
    }
  };

  // 安全显示答案，防止 XSS
  const safeAnswer = typeof interaction.answer === 'string'
    ? interaction.answer.slice(0, 200)
    : String(interaction.answer || '');

  // 如果已经回答，显示答案
  if (interaction.status === 'answered') {
    return (
      <Card style={{ marginBottom: 16, borderColor: '#52c41a' }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space>
            <QuestionCircleOutlined style={{ color: '#52c41a' }} />
            <Text strong>{interaction.question || '未知问题'}</Text>
            {getStatusTag()}
          </Space>
          {interaction.description && (
            <Paragraph type="secondary">{interaction.description}</Paragraph>
          )}
          <Alert
            type="success"
            message={`用户回复: ${safeAnswer}`}
            description={interaction.answeredAt ? `回复时间: ${new Date(interaction.answeredAt).toLocaleString()}` : ''}
          />
        </Space>
      </Card>
    );
  }

  // 如果已超时或取消，显示状态
  if (interaction.status === 'timeout' || interaction.status === 'cancelled') {
    return (
      <Card style={{ marginBottom: 16, borderColor: getStatusColor() }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space>
            <QuestionCircleOutlined style={{ color: getStatusColor() }} />
            <Text strong>{interaction.question || '未知问题'}</Text>
            {getStatusTag()}
          </Space>
          {interaction.description && (
            <Paragraph type="secondary">{interaction.description}</Paragraph>
          )}
        </Space>
      </Card>
    );
  }

  // 等待回复状态
  return (
    <Card
      style={{ marginBottom: 16, borderColor: getStatusColor() }}
      className="interaction-card"
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        <Alert
          type="warning"
          icon={<QuestionCircleOutlined />}
          message={
            <Space>
              <Text strong>需要确认</Text>
              {interaction.phase && (
                <Text type="secondary">阶段: {interaction.phase}</Text>
              )}
              {getStatusTag()}
            </Space>
          }
        />

        <Title level={5}>{interaction.question || '未知问题'}</Title>

        {interaction.description && (
          <Paragraph type="secondary">{interaction.description}</Paragraph>
        )}

        {renderInput()}

        <Button type="link" onClick={onCancel} disabled={submitting}>
          取消操作
        </Button>
      </Space>
    </Card>
  );
}

export default InteractionReply;