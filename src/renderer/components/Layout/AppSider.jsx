import React from 'react';
import { Button, Dropdown, Empty, List, Space, Tag, Typography, Layout } from 'antd';
import {
  AppstoreOutlined,
  BugOutlined,
  DeleteOutlined,
  EditOutlined,
  LeftOutlined,
  MoreOutlined,
  RightOutlined,
  RobotOutlined,
  SettingOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { NavButton } from '../common/UIComponents';
import { getProjectMeta } from '../../utils';

const { Sider } = Layout;
const { Title, Text } = Typography;

function AppSider({
  collapsed,
  projects,
  selectedProjectId,
  activeView,
  onToggleCollapse,
  onSelectProject,
  onChangeView,
  onEditProject,
  onDeleteProject,
  onCreateProject,
}) {
  const projectMenuItems = (project) => [
    {
      key: 'edit',
      label: '编辑项目',
      icon: <EditOutlined />,
      onClick: () => onEditProject(project),
    },
    {
      key: 'delete',
      label: (
        <span
          onClick={(e) => {
            e.stopPropagation();
            if (confirm('确认移除项目？仅删除 VCT 管理记录，不会删除工作目录源码。')) {
              onDeleteProject(project.id);
            }
          }}
        >
          删除项目
        </span>
      ),
      icon: <DeleteOutlined />,
    },
  ];

  return (
    <Sider
      width={260}
      collapsedWidth={64}
      collapsed={collapsed}
      className="project-sider"
      trigger={null}
    >
      <div className="sider-header">
        {!collapsed && (
          <div className="brand-block">
            <Title level={4}>VCT</Title>
          </div>
        )}
        <button
          type="button"
          className="sider-collapse-btn"
          onClick={onToggleCollapse}
          title={collapsed ? '展开侧边栏' : '收起侧边栏'}
        >
          {collapsed ? <RightOutlined /> : <LeftOutlined />}
        </button>
      </div>

      <div className="side-nav">
        <NavButton
          active={activeView === 'workspace'}
          icon={<AppstoreOutlined />}
          label="项目工作台"
          onClick={() => onChangeView('workspace')}
          collapsed={collapsed}
        />
        <NavButton
          active={activeView === 'bugs'}
          icon={<BugOutlined />}
          label="Bug 看板"
          onClick={() => onChangeView('bugs')}
          collapsed={collapsed}
        />
        <NavButton
          active={activeView === 'agent-monitor'}
          icon={<EyeOutlined />}
          label="任务监控"
          onClick={() => onChangeView('agent-monitor')}
          collapsed={collapsed}
        />
        <NavButton
          active={activeView === 'agents'}
          icon={<RobotOutlined />}
          label="Agent 管理"
          onClick={() => onChangeView('agents')}
          collapsed={collapsed}
        />
        <NavButton
          active={activeView === 'environment'}
          icon={<SettingOutlined />}
          label="本地环境"
          onClick={() => onChangeView('environment')}
          collapsed={collapsed}
        />
      </div>

      {!collapsed && (
        <>
          <div className="section-header">
            <Title level={5}>项目列表</Title>
            <Button type="primary" size="small" icon={<AppstoreOutlined />} onClick={onCreateProject}>
              新建
            </Button>
          </div>

          <List
            className="project-list"
            dataSource={projects}
            locale={{ emptyText: <Empty description="还没有项目" /> }}
            renderItem={(project) => {
              const meta = getProjectMeta(project.status);
              return (
                <List.Item
                  className={project.id === selectedProjectId ? 'project-item project-item-active' : 'project-item'}
                  onClick={() => {
                    onSelectProject(project.id);
                    onChangeView('workspace');
                  }}
                >
                  <div className="project-item-inner">
                    <Space direction="vertical" size={6} style={{ width: '100%' }}>
                      <Space className="space-between full-width">
                        <Text strong className="project-name-text">{project.name}</Text>
                        <Dropdown menu={{ items: projectMenuItems(project) }} trigger={['click']}>
                          <Button
                            size="small"
                            type="text"
                            icon={<MoreOutlined />}
                            onClick={(event) => event.stopPropagation()}
                          />
                        </Dropdown>
                      </Space>
                      <div className="project-item-meta">
                        <Tag color={meta.color} style={{ margin: 0 }}>{meta.label}</Tag>
                      </div>
                    </Space>
                  </div>
                </List.Item>
              );
            }}
          />
        </>
      )}

      {collapsed && (
        <div className="sider-collapsed-projects">
          {projects.slice(0, 5).map((project) => {
            const meta = getProjectMeta(project.status);
            return (
              <button
                key={project.id}
                type="button"
                className={`sider-project-icon ${project.id === selectedProjectId ? 'is-active' : ''}`}
                onClick={() => {
                  onSelectProject(project.id);
                  onChangeView('workspace');
                }}
                title={project.name}
              >
                <span
                  className="sider-project-dot"
                  style={{
                    background: meta.color === 'success' ? '#22c55e' : meta.color === 'warning' ? '#f59e0b' : '#6b7280'
                  }}
                />
              </button>
            );
          })}
          {projects.length > 5 && (
            <Text className="sider-project-more">+{projects.length - 5}</Text>
          )}
        </div>
      )}
    </Sider>
  );
}

export default AppSider;