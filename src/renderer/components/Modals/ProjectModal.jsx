import React from 'react';
import { Button, Form, Input, Modal, Select, Space, Tag } from 'antd';
import { FolderOpenOutlined } from '@ant-design/icons';
import { CLI_DISPLAY_NAMES } from '../../constants';

const { TextArea } = Input;

function ProjectModal({
  open,
  loading,
  editingProject,
  cliAgents,
  form,
  onChooseDirectory,
  onCancel,
  onOk,
}) {
  return (
    <Modal
      title={editingProject ? '编辑项目' : '新建项目'}
      open={open}
      confirmLoading={loading}
      onCancel={onCancel}
      onOk={onOk}
      okText={editingProject ? '保存修改' : '创建项目'}
    >
       <div style={{height: 600, overflowY: 'auto'}}>
      <Form form={form} layout="vertical" initialValues={{ agent: 'claude-code' }}>
        <Form.Item name="name" label="项目名称" rules={[{ required: true, message: '请输入项目名称' }]}>
          <Input placeholder="例如：Electron 自动开发平台" />
        </Form.Item>
        <Form.Item name="description" label="项目说明">
          <TextArea rows={3} placeholder="描述项目目标、技术背景与约束" />
        </Form.Item>
        <Form.Item name="workDir" label="工作目录">
          <Input
            placeholder="留空则默认创建到当前仓库下的 workspaces 目录"
            addonAfter={
              <Button type="link" icon={<FolderOpenOutlined />} onClick={onChooseDirectory}>
                选择
              </Button>
            }
          />
        </Form.Item>
        <Form.Item name="agent" label="CLI Agent">
          <Select placeholder="选择 CLI Agent">
            {Object.entries(cliAgents || {}).map(([key, info]) => {
              return (
                <Select.Option key={key} value={key} disabled={!info?.installed}>
                  <Space>
                    <span>{CLI_DISPLAY_NAMES[key] || key}</span>
                    {info?.installed ? (
                      <Tag color="success" style={{ marginLeft: 4 }}>已就绪</Tag>
                    ) : (
                      <Tag color="error" style={{ marginLeft: 4 }}>未安装</Tag>
                    )}
                  </Space>
                </Select.Option>
              );
            })}
          </Select>
        </Form.Item>
      </Form>
      </div>

    </Modal>
  );
}

export default ProjectModal;