import React from 'react';
import { Divider, Form, Input, InputNumber, Modal, Select, Space, Switch, Tooltip } from 'antd';
import { CLI_DISPLAY_NAMES } from '../../constants';

const { TextArea } = Input;

function AgentModal({
  open,
  loading,
  editing,
  form,
  cliAgents,
  onCancel,
  onOk,
}) {
  return (
    <Modal
      title={editing ? '编辑 Agent' : '新建 Agent'}
      open={open}
      confirmLoading={loading}
      onCancel={onCancel}
      onOk={onOk}
      okText={editing ? '保存修改' : '创建 Agent'}
      width={600}
    >
      <Form form={form} layout="vertical" initialValues={{ cliType: 'claude-code', maxTurns: 30, enabled: true }}>
        <Form.Item name="name" label="Agent 名称" rules={[{ required: true, message: '请输入 Agent 名称' }]}>
          <Input placeholder="例如：前端开发专家" />
        </Form.Item>
        <Form.Item name="description" label="描述">
          <TextArea rows={2} placeholder="描述此 Agent 的用途和特点" />
        </Form.Item>
        <Form.Item name="cliType" label="基础 CLI" rules={[{ required: true }]}>
          <Select placeholder="选择基础 CLI">
            {Object.entries(cliAgents).map(([key, info]) => (
              <Select.Option key={key} value={key} disabled={!info?.installed}>
                <Space>
                  <span>{CLI_DISPLAY_NAMES[key] || key}</span>
                  {info?.installed ? (
                    <span color="success" style={{ marginLeft: 4, color: '#22c55e' }}>已就绪</span>
                  ) : (
                    <span color="error" style={{ marginLeft: 4, color: '#ef4444' }}>未安装</span>
                  )}
                </Space>
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        <Divider>高级配置</Divider>

        <Form.Item
          name="systemPrompt"
          label={
            <Tooltip title="自定义系统提示词，覆盖默认行为">
              <span>系统提示词</span>
            </Tooltip>
          }
        >
          <TextArea rows={4} placeholder="自定义系统提示词，指导 Agent 的行为..." />
        </Form.Item>
        <Form.Item
          name="model"
          label={
            <Tooltip title="指定使用的模型，如 claude-sonnet-4-6">
              <span>模型</span>
            </Tooltip>
          }
        >
          <Input placeholder="例如：claude-sonnet-4-6" />
        </Form.Item>
        <Form.Item
          name="apiBaseUrl"
          label={
            <Tooltip title="第三方 API 地址，用于自定义 API 端点">
              <span>API 地址</span>
            </Tooltip>
          }
        >
          <Input placeholder="例如：https://api.example.com/v1" />
        </Form.Item>
        <Form.Item
          name="apiKey"
          label={
            <Tooltip title="API Key，用于认证第三方 API。注意：此信息将明文存储，请妥善保管。">
              <span>API Key</span>
            </Tooltip>
          }
        >
          <Input.Password placeholder="输入 API Key" />
        </Form.Item>
        <Form.Item name="maxTurns" label="最大轮次">
          <InputNumber min={1} max={100} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="enabled" label="启用" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default AgentModal;