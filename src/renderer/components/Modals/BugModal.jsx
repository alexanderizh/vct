import React from 'react';
import { Button, Form, Input, Modal, Select, Space, Tag, Tooltip, Typography } from 'antd';
import { RobotOutlined, SettingOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { BUG_SEVERITY_OPTIONS, BUG_SOURCE_OPTIONS } from '../../constants';

const { TextArea } = Input;
const { Text } = Typography;

function BugModal({
  open,
  loading,
  editingBug,
  agents,
  tasks,
  form,
  onCancel,
  onOk,
  onSaveAndFix,
}) {
  return (
    <Modal
      title={editingBug ? '编辑 Bug' : '新建 Bug'}
      open={open}
      confirmLoading={loading}
      onCancel={onCancel}
      width={640}
      footer={
        editingBug ? (
          <Space>
            <Button onClick={onCancel}>取消</Button>
            <Button type="primary" loading={loading} onClick={onOk}>
              保存修改
            </Button>
          </Space>
        ) : (
          <Space>
            <Button onClick={onCancel}>取消</Button>
            <Button loading={loading} onClick={onSaveAndFix} icon={<PlayCircleOutlined />}>
              保存并立即修复
            </Button>
            <Button type="primary" loading={loading} onClick={onOk}>
              保存
            </Button>
          </Space>
        )
      }
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          severity: 'medium',
          source: 'manual',
          boardStatus: 'todo',
          agentId: '',
          relatedTaskId: '',
        }}
      >
        <Form.Item name="title" label="Bug 标题" rules={[{ required: true, message: '请输入 Bug 标题' }]}>
          <Input placeholder="例如：登录页面点击提交按钮无响应" />
        </Form.Item>
        <Form.Item name="description" label="Bug 描述">
          <TextArea rows={3} placeholder="详细描述 Bug 的表现和影响" />
        </Form.Item>
        <Space style={{ width: '100%' }} size="large">
          <Form.Item name="severity" label="严重程度" style={{ width: 180 }}>
            <Select options={BUG_SEVERITY_OPTIONS} />
          </Form.Item>
          <Form.Item name="source" label="Bug 来源" style={{ width: 180 }}>
            <Select options={BUG_SOURCE_OPTIONS} />
          </Form.Item>
          <Form.Item name="boardStatus" label="看板状态" style={{ width: 180 }}>
            <Select options={[
              { value: 'todo', label: '待处理' },
              { value: 'in_progress', label: '进行中' },
              { value: 'blocked', label: '阻塞' },
              { value: 'suspended', label: '已挂起' },
              { value: 'done', label: '已完成' },
            ]} />
          </Form.Item>
        </Space>
        <Form.Item name="relatedTaskId" label="关联需求">
          <Select placeholder="选择关联的需求（可选）" allowClear showSearch optionFilterProp="children">
            {tasks.map((task) => (
              <Select.Option key={task.id} value={task.id}>
                {task.title}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item name="filepaths" label="涉及文件">
          <TextArea rows={2} placeholder="每行一个文件路径，例如：&#10;src/components/Login.jsx&#10;src/services/auth.js" />
        </Form.Item>
        <Form.Item name="reproductionSteps" label="复现步骤">
          <TextArea rows={3} placeholder="1. 打开登录页面&#10;2. 输入用户名和密码&#10;3. 点击提交按钮&#10;4. 观察到无响应" />
        </Form.Item>
        <Form.Item name="stackTrace" label="错误堆栈">
          <TextArea rows={3} placeholder="粘贴错误堆栈信息（如有）" />
        </Form.Item>
        <Form.Item
          name="agentId"
          label={
            <Space>
              <span>修复 Agent</span>
              <Tooltip title="选择修复此 Bug 的 Agent。如不选择，将使用项目默认 CLI。">
                <SettingOutlined style={{ color: 'var(--text-soft)' }} />
              </Tooltip>
            </Space>
          }
        >
          <Select placeholder="使用项目默认 CLI" allowClear>
            {agents.filter((a) => a.enabled).map((agent) => (
              <Select.Option key={agent.id} value={agent.id}>
                <Space>
                  <RobotOutlined />
                  <span>{agent.name}</span>
                  <Tag color="blue" style={{ marginLeft: 4 }}>{agent.cliType}</Tag>
                </Space>
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default BugModal;