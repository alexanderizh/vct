import React, { useState } from 'react';
import { Button, Card, Modal, Popconfirm, Space, Typography } from 'antd';
import { ClearOutlined, ExpandAltOutlined } from '@ant-design/icons';
import TerminalPanel from '../Terminal/TerminalPanel';

const { Text } = Typography;

function TerminalCard({
  projectId,
  project,
  progress,
  onClearHistory,
}) {
  const [fullscreenOpen, setFullscreenOpen] = useState(false);

  const isRunning = project?.status === 'running';
  const phaseLabel = progress?.currentPhase || null;

  const toolbarContent = (
    <div className="terminal-toolbar">
      <div className="terminal-status">
        <span className={`terminal-status-dot ${isRunning ? 'is-active' : ''}`} />
        <Text className="terminal-toolbar-text">
          {isRunning ? '运行中' : '空闲'}
        </Text>
      </div>
      <Text className="terminal-toolbar-text">
        {phaseLabel ? `阶段：${phaseLabel}` : '等待启动'}
      </Text>
    </div>
  );

  return (
    <>
      <Card
        title="实时终端"
        className="terminal-card"
        extra={(
          <Space>
            <Text type="secondary">仅保留可读输出</Text>
            <Popconfirm
              title="确认清除终端日志？"
              description="清除后将无法恢复当前终端输出。"
              onConfirm={onClearHistory}
            >
              <Button type="text" icon={<ClearOutlined />}>
                清除
              </Button>
            </Popconfirm>
            <Button
              type="text"
              icon={<ExpandAltOutlined />}
              onClick={() => setFullscreenOpen(true)}
            >
              全屏
            </Button>
          </Space>
        )}
      >
        <div className="terminal-frame">
          {toolbarContent}
          {!fullscreenOpen && <TerminalPanel projectId={projectId} />}
        </div>
        <Text className="terminal-tip">
          协议级 JSON 和无效噪声已折叠，保留阶段输出、错误和结果摘要。
        </Text>
      </Card>

      <Modal
        open={fullscreenOpen}
        footer={null}
        width="92vw"
        centered
        destroyOnClose
        className="terminal-fullscreen-modal"
        title={project ? `${project.name} · 实时终端` : '实时终端'}
        onCancel={() => setFullscreenOpen(false)}
      >
         <div style={{height: 600, overflowY: 'auto'}}>
   <div className="terminal-frame terminal-frame-fullscreen">
          {toolbarContent}
          <TerminalPanel projectId={projectId} />
        </div>
        <Text className="terminal-tip">
          全屏模式适合排查长输出、错误堆栈和多阶段执行日志。
        </Text>
      </div>
     
      </Modal>
    </>
  );
}

export default TerminalCard;