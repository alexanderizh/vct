// 看板状态选项
export const BOARD_STATUS_OPTIONS = [
  { value: 'todo', label: '待处理', color: 'default' },
  { value: 'in_progress', label: '进行中', color: 'processing' },
  { value: 'blocked', label: '阻塞', color: 'warning' },
  { value: 'suspended', label: '已挂起', color: 'volcano' },
  { value: 'done', label: '已完成', color: 'success' },
];

// 优先级选项
export const PRIORITY_OPTIONS = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'critical', label: '紧急' },
];

// 优先级元数据
export const PRIORITY_META = {
  low: { label: '低优先级', color: 'default' },
  medium: { label: '中优先级', color: 'blue' },
  high: { label: '高优先级', color: 'orange' },
  critical: { label: '紧急', color: 'red' },
};

// 执行状态元数据
export const EXECUTION_STATUS_META = {
  idle: { label: '空闲', color: 'default' },
  queued: { label: '排队中', color: 'default' },
  analyzing: { label: '分析中', color: 'processing' },
  planning: { label: '计划中', color: 'processing' },
  developing: { label: '开发中', color: 'processing' },
  reviewing: { label: '审查中', color: 'purple' },
  testing: { label: '测试中', color: 'cyan' },
  fixing: { label: '修复中', color: 'orange' },
  committing: { label: '提交中', color: 'magenta' },
  completed: { label: '已完成', color: 'success' },
  failed: { label: '失败', color: 'error' },
};

// 项目状态元数据
export const PROJECT_STATUS_META = {
  idle: { label: '空闲', color: 'default' },
  running: { label: '运行中', color: 'success' },
  paused: { label: '已暂停', color: 'warning' },
};

// CLI 显示名称映射
export const CLI_DISPLAY_NAMES = {
  'claude-code': 'Claude Code',
  'opencode': 'OpenCode',
};

// Bug 严重程度选项
export const BUG_SEVERITY_OPTIONS = [
  { value: 'low', label: '低', color: 'default' },
  { value: 'medium', label: '中', color: 'blue' },
  { value: 'high', label: '高', color: 'orange' },
  { value: 'critical', label: '紧急', color: 'red' },
];

// Bug 严重程度元数据
export const BUG_SEVERITY_META = {
  low: { label: '低严重程度', color: 'default' },
  medium: { label: '中严重程度', color: 'blue' },
  high: { label: '高严重程度', color: 'orange' },
  critical: { label: '紧急', color: 'red' },
};

// Bug 来源选项
export const BUG_SOURCE_OPTIONS = [
  { value: 'manual', label: '手动提交', color: 'default' },
  { value: 'code_review', label: '代码审查', color: 'purple' },
  { value: 'testing', label: '功能测试', color: 'cyan' },
  { value: 'auto_detect', label: '自动检测', color: 'green' },
];

// Bug 来源元数据
export const BUG_SOURCE_META = {
  manual: { label: '手动提交', color: 'default' },
  code_review: { label: '代码审查', color: 'purple' },
  testing: { label: '功能测试', color: 'cyan' },
  auto_detect: { label: '自动检测', color: 'green' },
};

// Bug 执行状态元数据
export const BUG_EXECUTION_STATUS_META = {
  idle: { label: '空闲', color: 'default' },
  analyzing: { label: '分析中', color: 'processing' },
  fixing: { label: '修复中', color: 'orange' },
  verifying: { label: '验证中', color: 'cyan' },
  completed: { label: '已完成', color: 'success' },
  failed: { label: '失败', color: 'error' },
};
