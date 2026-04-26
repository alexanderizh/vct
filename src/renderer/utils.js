import {
  BOARD_STATUS_OPTIONS,
  PRIORITY_META,
  EXECUTION_STATUS_META,
  PROJECT_STATUS_META,
  BUG_SEVERITY_META,
  BUG_SOURCE_META,
  BUG_EXECUTION_STATUS_META,
} from './constants';

// 获取看板状态元数据
export function getBoardMeta(status) {
  return BOARD_STATUS_OPTIONS.find((item) => item.value === status) || BOARD_STATUS_OPTIONS[0];
}

// 获取执行状态元数据
export function getExecutionMeta(status) {
  return EXECUTION_STATUS_META[status] || EXECUTION_STATUS_META.idle;
}

// 获取项目状态元数据
export function getProjectMeta(status) {
  return PROJECT_STATUS_META[status] || PROJECT_STATUS_META.idle;
}

// 获取优先级元数据
export function getPriorityMeta(priority) {
  return PRIORITY_META[priority] || PRIORITY_META.medium;
}

// 格式化时间
export function formatTime(value) {
  if (!value) return '暂无';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

// 清理终端输出（过滤协议噪声）
export function sanitizeTerminalOutput(value) {
  if (!value) return '';

  return String(value)
    // Filter warning messages about stdin
    .replace(/Warning: no stdin data received in \d+s,[^\n]*\n?/g, '')
    // Filter long JSON lines that are protocol noise
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true; // Keep empty lines for formatting
      // Filter long JSON objects that contain system/protocol fields
      if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.length > 200) {
        return !(
          trimmed.includes('"type":"system"') ||
          trimmed.includes('"tools":[') ||
          trimmed.includes('"permissionMode"') ||
          trimmed.includes('"mcp__') ||
          trimmed.includes('"api_retry"') ||
          trimmed.includes('"cost_usd"') ||
          trimmed.includes('"duration_ms"') ||
          trimmed.includes('"input_json_delta"')
        );
      }
      return true;
    })
    .join('\n');
}

// 获取 Bug 严重程度元数据
export function getBugSeverityMeta(severity) {
  return BUG_SEVERITY_META[severity] || BUG_SEVERITY_META.medium;
}

// 获取 Bug 来源元数据
export function getBugSourceMeta(source) {
  return BUG_SOURCE_META[source] || BUG_SOURCE_META.manual;
}

// 获取 Bug 执行状态元数据
export function getBugExecutionMeta(status) {
  return BUG_EXECUTION_STATUS_META[status] || BUG_EXECUTION_STATUS_META.idle;
}
