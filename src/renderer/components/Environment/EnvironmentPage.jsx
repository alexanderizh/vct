import React from 'react';
import { Button, Card, Empty, Space, Tag, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { EnvironmentStatusCard, MetricTile } from '../common/UIComponents';
import { CLI_DISPLAY_NAMES } from '../../constants';

const { Title, Paragraph, Text } = Typography;

function EnvironmentPage({ environment, onRefresh }) {
  // Build CLI checks from the cliAgents data
  const cliChecks = Object.entries(environment.cliAgents || {}).map(([key, info]) => {
    return {
      key,
      title: CLI_DISPLAY_NAMES[key] || key,
      installed: Boolean(info?.installed),
      summary: info?.installed ? 'CLI 已连接，可直接执行自动开发任务' : 'CLI 尚未就绪',
      details: info?.installed
        ? `${info.version || ''}\n${info.authStatus || ''}`
        : info?.error,
      action: info?.installed ? '可开始项目自动化流程' : '请先完成 CLI 安装或鉴权',
    };
  });

  const checks = [
    ...cliChecks,
    {
      key: 'git',
      title: 'Git',
      installed: Boolean(environment.git?.installed),
      summary: environment.git?.installed ? '版本控制环境可用' : 'Git 尚未就绪',
      details: environment.git?.installed ? environment.git.version : environment.git?.error,
      action: environment.git?.installed ? '支持拉取、提交与变更追踪' : '请先安装 Git 或检查 PATH',
    },
  ];

  const readyCount = checks.filter((item) => item.installed).length;
  const pendingChecks = checks.filter((item) => !item.installed);
  const nextSteps = pendingChecks.length
    ? pendingChecks.map((item) => `${item.title} 需要处理：${item.action}`)
    : [
        '当前基础依赖已经就绪，可以直接回到项目工作台启动自动开发流程。',
        '如果后续增加 Node、pnpm、Python 等检查项，这里会继续集中展示。',
      ];

  return (
    <div className="environment-page">
      <Card className="environment-hero">
        <div className="environment-hero-head">
          <div>
            <Title level={3}>本地环境检查</Title>
            <Paragraph className="environment-hero-copy">
              这里集中检查 VCT 运行依赖，避免把环境诊断和项目工作台混在一起。
            </Paragraph>
          </div>
          <Button type="primary" icon={<ReloadOutlined />} onClick={onRefresh}>
            重新检查
          </Button>
        </div>

        <div className="overview-metrics">
          <MetricTile label="检查项" value={checks.length} hint="当前内置环境检查项数" />
          <MetricTile label="已通过" value={readyCount} hint="可直接投入使用的能力" tone="success" />
          <MetricTile
            label="待处理"
            value={checks.length - readyCount}
            hint={checks.length - readyCount ? '建议优先补齐基础依赖' : '当前环境完整'}
            tone={checks.length - readyCount ? 'warning' : 'accent'}
          />
          <MetricTile
            label="整体状态"
            value={readyCount === checks.length ? '就绪' : '待完善'}
            hint="环境状态会影响后续自动执行"
            tone="accent"
          />
        </div>
      </Card>

      <div className="environment-grid">
        {checks.map((item) => (
          <Card key={item.key} className="environment-panel" title={item.title}>
            <EnvironmentStatusCard
              title={item.title}
              installed={item.installed}
              summary={item.summary}
              details={item.details}
            />
            <div className="environment-note">
              <Text strong>{item.action}</Text>
            </div>
          </Card>
        ))}
      </div>

      <div className="environment-bottom-grid">
        <Card title="下一步建议" className="environment-panel">
          <div className="environment-checklist">
            {nextSteps.map((step) => (
              <div key={step} className="environment-checklist-item">
                <span className="environment-checklist-dot" />
                <Text>{step}</Text>
              </div>
            ))}
          </div>
        </Card>

        <Card title="诊断摘要" className="environment-panel">
          <div className="environment-summary-stack">
            {Object.entries(environment.cliAgents || {}).map(([key, info]) => {
              return (
                <div key={key} className="environment-summary-item">
                  <Text className="metric-label">{CLI_DISPLAY_NAMES[key] || key}</Text>
                  <Text strong>{info?.installed ? '已连接并鉴权' : '未就绪'}</Text>
                </div>
              );
            })}
            <div className="environment-summary-item">
              <Text className="metric-label">Git</Text>
              <Text strong>{environment.git?.installed ? '可用于拉取与提交' : '未就绪'}</Text>
            </div>
            <div className="environment-summary-item">
              <Text className="metric-label">推荐动作</Text>
              <Text strong>{pendingChecks.length ? '先补齐依赖，再启动项目' : '可以返回工作台开始执行'}</Text>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default EnvironmentPage;