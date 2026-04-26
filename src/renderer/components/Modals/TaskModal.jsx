import React from 'react';
import { Button, Form, Input, Modal, Select, Space, Tag, Tooltip, Typography } from 'antd';
import { RobotOutlined, SettingOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { PRIORITY_OPTIONS } from '../../constants';

const { TextArea } = Input;
const { Text } = Typography;

function TaskModal({
  open,
  loading,
  editingTask,
  agents,
  form,
  onCancel,
  onOk,
  onSaveAndRun,
}) {
  return (
    <Modal
      title={editingTask ? '编辑需求' : '新建需求'}
      open={open}
      confirmLoading={loading}
      onCancel={onCancel}
      footer={
        editingTask ? (
          <Space>
            <Button onClick={onCancel}>取消</Button>
            <Button type="primary" loading={loading} onClick={onOk}>
              保存修改
            </Button>
          </Space>
        ) : (
          <Space>
            <Button onClick={onCancel}>取消</Button>
            <Button loading={loading} onClick={onSaveAndRun} icon={<ThunderboltOutlined />}>
              保存并立即执行
            </Button>
            <Button type="primary" loading={loading} onClick={onOk}>
              保存
            </Button>
          </Space>
        )
      }
    >
       <div style={{height: 600, overflowY: 'auto'}}>
      <Form form={form} layout="vertical" initialValues={{ priority: 'medium', boardStatus: 'todo', agentId: '' }}>
        <Form.Item name="title" label="需求标题" rules={[{ required: true, message: '请输入需求标题' }]}>
          <Input placeholder="例如：补齐项目详情页和终端联动" />
        </Form.Item>
        <Form.Item name="description" label="需求描述">
          <TextArea rows={4} placeholder="补充业务目标、验收标准和注意事项" />
        </Form.Item>
        <Form.Item
          name="agentId"
          label={
            <Space>
              <span>执行 Agent</span>
              <Tooltip title="选择执行此任务的 Agent。如不选择，将使用项目默认 CLI。">
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
        <Form.Item name="priority" label="优先级">
          <Select options={PRIORITY_OPTIONS} />
        </Form.Item>
        <Form.Item name="boardStatus" label="看板状态">
          <Select options={[
            { value: 'todo', label: '待处理' },
            { value: 'in_progress', label: '进行中' },
            { value: 'blocked', label: '阻塞' },
            { value: 'suspended', label: '已挂起' },
            { value: 'done', label: '已完成' },
          ]} />
        </Form.Item>
      </Form>
      </div>

    </Modal>
  );
}

export default TaskModal;