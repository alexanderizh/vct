import React, { useState, useEffect } from 'react';
import { Divider, Form, Input, InputNumber, Modal, Select, Space, Switch, Tooltip, Typography, Tag, Button } from 'antd';
import { PlusOutlined, DeleteOutlined, HolderOutlined } from '@ant-design/icons';
import { CLI_DISPLAY_NAMES } from '../../constants';

const { TextArea } = Input;
const { Text } = Typography;

// 可用的工作流程阶段
const AVAILABLE_PHASES = [
  { key: 'analyze', name: '需求分析', description: '分析任务需求和代码结构' },
  { key: 'plan', name: '制定计划', description: '制定实现计划' },
  { key: 'develop', name: '开发实现', description: '编写代码实现功能' },
  { key: 'review', name: '代码审查', description: '审查代码质量' },
  { key: 'test', name: '功能测试', description: '验证功能正确性' },
  { key: 'fix', name: '修复缺陷', description: '修复发现的问题' },
  { key: 'commit', name: '提交代码', description: '提交并推送代码变更' },
  { key: 'execute', name: '直接执行', description: '直接完成任务，无需分阶段' },
];

// 默认工作流程
const DEFAULT_WORKFLOW = ['analyze', 'plan', 'develop', 'review', 'test', 'fix'];

function AgentModal({
  open,
  loading,
  editing,
  form,
  cliAgents,
  onCancel,
  onOk,
}) {
  const [useCustomWorkflow, setUseCustomWorkflow] = useState(false);
  const [workflow, setWorkflow] = useState(DEFAULT_WORKFLOW);

  // 当编辑 agent 时，同步 workflow 状态
  useEffect(() => {
    if (editing) {
      const agentWorkflow = editing.workflow || DEFAULT_WORKFLOW;
      setUseCustomWorkflow(editing.useCustomWorkflow === true);
      setWorkflow(agentWorkflow);
      // 同步到 form
      form.setFieldValue('workflow', agentWorkflow);
      form.setFieldValue('useCustomWorkflow', editing.useCustomWorkflow === true);
    } else {
      setUseCustomWorkflow(false);
      setWorkflow(DEFAULT_WORKFLOW);
      form.setFieldValue('workflow', DEFAULT_WORKFLOW);
      form.setFieldValue('useCustomWorkflow', false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id, open]);

  // 添加阶段到工作流程
  const handleAddPhase = (phaseKey) => {
    if (!workflow.includes(phaseKey)) {
      const newWorkflow = [...workflow, phaseKey];
      setWorkflow(newWorkflow);
      form.setFieldValue('workflow', newWorkflow);
    }
  };

  // 从工作流程移除阶段
  const handleRemovePhase = (index) => {
    const newWorkflow = [...workflow];
    newWorkflow.splice(index, 1);
    setWorkflow(newWorkflow);
    form.setFieldValue('workflow', newWorkflow);
  };

  // 重置为默认工作流程
  const handleResetWorkflow = () => {
    setWorkflow(DEFAULT_WORKFLOW);
    form.setFieldValue('workflow', DEFAULT_WORKFLOW);
  };

  // 获取阶段名称
  const getPhaseName = (key) => {
    const phase = AVAILABLE_PHASES.find(p => p.key === key);
    return phase ? phase.name : key;
  };

  // 处理确认，确保 workflow 被同步到 form
  const handleOk = () => {
    // 同步 workflow 到 form
    form.setFieldValue('workflow', workflow);
    form.setFieldValue('useCustomWorkflow', useCustomWorkflow);
    onOk();
  };

  return (
    <Modal
      title={editing ? '编辑 Agent' : '新建 Agent'}
      open={open}
      confirmLoading={loading}
      onCancel={onCancel}
      onOk={handleOk}
      okText={editing ? '保存修改' : '创建 Agent'}
      width={700}
    >
      <div style={{ height: 650, overflowY: 'auto' }}>
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            cliType: 'claude-code',
            maxTurns: 30,
            enabled: true,
            useCustomWorkflow: false,
            autoCommit: true,
            workflow: DEFAULT_WORKFLOW,
          }}
        >
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

          <Divider>工作流程配置</Divider>

          <Form.Item
            name="useCustomWorkflow"
            label={
              <Tooltip title="启用后，此 Agent 将使用自定义的工作流程，而不是系统默认的任务分类流程">
                <span>使用自定义工作流程</span>
              </Tooltip>
            }
            valuePropName="checked"
          >
            <Switch
              onChange={(checked) => {
                setUseCustomWorkflow(checked);
              }}
            />
          </Form.Item>

          {useCustomWorkflow && (
            <>
              <div style={{ marginBottom: 16 }}>
                <Text type="secondary">
                  自定义 Agent 的工作流程阶段。Git 拉取会在任务开始前自动执行，代码提交会在有变更时自动执行。
                </Text>
              </div>

              <div
                style={{
                  border: '1px solid #d9d9d9',
                  borderRadius: 6,
                  padding: 12,
                  marginBottom: 16,
                  background: '#fafafa',
                }}
              >
                <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text strong>执行阶段</Text>
                  <Button size="small" onClick={handleResetWorkflow}>
                    重置默认
                  </Button>
                </div>

                {workflow.length === 0 ? (
                  <Text type="secondary">请添加执行阶段</Text>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {workflow.map((phaseKey, index) => (
                      <Tag
                        key={index}
                        closable
                        onClose={() => handleRemovePhase(index)}
                        style={{ padding: '4px 8px', fontSize: 13 }}
                        color="blue"
                      >
                        {index + 1}. {getPhaseName(phaseKey)}
                      </Tag>
                    ))}
                  </div>
                )}
              </div>

              <Form.Item label="添加阶段">
                <Select
                  placeholder="选择要添加的阶段"
                  onSelect={handleAddPhase}
                  value={undefined}
                  style={{ width: '100%' }}
                >
                  {AVAILABLE_PHASES.filter(p => !workflow.includes(p.key)).map(phase => (
                    <Select.Option key={phase.key} value={phase.key}>
                      <div>
                        <Text strong>{phase.name}</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 12 }}>{phase.description}</Text>
                      </div>
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item
                name="autoCommit"
                label={
                  <Tooltip title="任务完成后，如果有代码变更则自动执行 git commit 和 push">
                    <span>自动提交代码</span>
                  </Tooltip>
                }
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
            </>
          )}

          {/* 隐藏字段存储 workflow */}
          <Form.Item name="workflow" hidden>
            <input type="hidden" />
          </Form.Item>

          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </div>
    </Modal>
  );
}

export default AgentModal;
