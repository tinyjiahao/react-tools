// localStorage 安全读写 + key 常量集中管理
// 解决问题：
//  1. 损坏/手改过的 r2_config 值会让 JSON.parse 直接抛 SyntaxError，冒泡出事件处理器
//     导致操作无响应（P0）。所有读取统一走 safeGetConfig，带 try/catch + 字段校验。
//  2. setItem 在隐私模式 / 存储满时抛 QuotaExceededError，统一用 safeSetItem 兜底。
//  3. localStorage key 之前以原始字符串散落在 14+ 处，拼写错误会导致功能静默失联，
//     现集中为常量。

import type { Config } from './types';

/** 所有 localStorage key 集中声明，避免散落字符串拼写错误 */
export const STORAGE_KEYS = {
  r2Config: 'r2_config',
  r2ImageConfig: 'r2_image_config',
  darkMode: 'darkMode',
  themeColor: 'themeColor',
  layoutMode: 'layoutMode',
  monacoTheme: 'monaco_theme',
  monacoLanguage: 'monaco_language',
  notesSidebarCollapsed: 'notes_sidebar_collapsed',
  notesSelectedId: 'notes_selected_id',
  drawioSidebarCollapsed: 'drawio_sidebar_collapsed',
  drawioSelectedId: 'drawio_selected_id',
  qrHistory: 'qr_history',
  urlHistory: 'url_history',
  base64History: 'base64_history',
  performanceData: 'performanceData',
  performanceHistory: 'performanceHistory',
} as const;

/**
 * 安全读取并解析 localStorage 中的 Config。
 * - localStorage 无值 → null
 * - JSON 解析失败或结构不合法 → 返回 null（调用方据此提示用户重新配置）
 * 永不抛错。
 */
export function safeGetConfig(key: string): Config | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // 配置被手改成非法 JSON，按未配置处理，避免抛错打断用户操作
    return null;
  }

  if (
    parsed &&
    typeof parsed === 'object' &&
    typeof (parsed as Config).workerUrl === 'string' &&
    typeof (parsed as Config).apiToken === 'string'
  ) {
    return parsed as Config;
  }
  return null;
}

/**
 * 安全写入 localStorage，捕获 QuotaExceededError（隐私模式 / 存储已满）。
 * 返回是否写入成功。
 */
export function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    console.warn(`localStorage.setItem("${key}") 失败:`, err);
    return false;
  }
}

/** 安全读取并解析任意 JSON 值；失败返回 fallback */
export function safeGetJSON<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
