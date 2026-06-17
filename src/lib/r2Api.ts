// R2 / Worker 通信的共享封装
// 解决问题：
//  1. callWorkerApi 之前在 4 个组件里重复定义，且参数顺序不一致
//     （R2FileManager/MarkdownViewer 是 (action, body, config)，
//      R2ImageManager/NotesManager 是 (action, config, body)），极易误用。
//     统一为 (action, config, body)。
//  2. 带进度的 XHR 上传重复了 5 次。抽为 uploadWithProgress。
//  3. P0 安全：上传的 apiToken 之前拼进 URL query（?authorization=xxx），
//     会进入访问日志/浏览器历史/Referer。现统一走 Authorization header。

import type { Config } from './types';

/** 统一的 Worker JSON 调用（list/delete/rename 等非上传接口） */
export async function callWorkerApi(
  action: string,
  config: Config,
  body?: Record<string, unknown>
): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (config.apiToken) {
    headers['Authorization'] = `Bearer ${config.apiToken}`;
  }

  const response = await fetch(`${config.workerUrl}?action=${action}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(errorData.error || `操作失败 (${response.status})`);
  }

  return response.json();
}

/**
 * 带上传进度的 FormData 上传。
 * token 通过 Authorization header 传递，不再进入 URL（修复 token 泄露）。
 * @param onProgress 进度回调，参数为 0-100 的百分比
 */
export function uploadWithProgress(
  config: Config,
  formData: FormData,
  onProgress?: (percent: number) => void
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        resolve();
      } else {
        let errorMsg = '上传失败';
        try {
          const errorData = JSON.parse(xhr.responseText);
          errorMsg = errorData.error || '上传失败';
        } catch {
          // 响应非 JSON，使用默认错误信息
        }
        reject(new Error(`上传失败 (${xhr.status}): ${errorMsg}`));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('上传失败，请检查网络连接'));
    });

    xhr.open('POST', `${config.workerUrl}?action=upload`);
    // token 走 header，不进 URL —— 修复 P0 token 泄露
    if (config.apiToken) {
      xhr.setRequestHeader('Authorization', `Bearer ${config.apiToken}`);
    }
    xhr.send(formData);
  });
}
