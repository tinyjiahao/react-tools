// Cloudflare Worker 代码 - R2 文件管理
// 将此代码复制到 Cloudflare Worker 的编辑器中
// 需要在 Worker 的环境变量中配置：
//   - R2_BUCKET:    R2 存储桶绑定
//   - API_TOKEN:    访问令牌（必填，未配置时所有写操作一律拒绝，fail-closed）
//   - ALLOWED_ORIGINS: 允许的跨域来源，逗号分隔（如 "https://your-app.pages.dev,http://localhost:3000"）
//                      未配置时回退到 "*"（仅适合本地调试，生产请务必配置）

// 允许的文件 key 前缀（其余路径一律拒绝，避免越权访问任意对象）
const ALLOWED_PREFIXES = ['notes/', 'markdown_file/', 'assets/'];
// 图片扩展名（用于 /file/ 内联展示与公开访问判断）
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'];
// 单文件上传大小上限（100MB，R2 / Worker 的合理上限）
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/** 解析并返回允许的跨域来源集合 */
function getAllowedOrigins(env) {
  const raw = env.ALLOWED_ORIGINS;
  if (!raw) return null; // null 表示未配置，回退到 "*"
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

/** 构造 CORS 响应头；配了白名单就反射匹配的 Origin，否则回退 "*" */
function buildCorsHeaders(env, requestOrigin) {
  const allowed = getAllowedOrigins(env);
  if (allowed && allowed.length > 0) {
    if (requestOrigin && allowed.includes(requestOrigin)) {
      return {
        'Access-Control-Allow-Origin': requestOrigin,
        'Vary': 'Origin',
      };
    }
    // 未匹配白名单：不回显 Origin（浏览器会拒绝跨域读取）
    return { 'Vary': 'Origin' };
  }
  // 未配置白名单（本地调试）：回退到开放 CORS
  return { 'Access-Control-Allow-Origin': '*' };
}

/**
 * 校验 key 是否安全：
 * - 拒绝包含 ".."（路径穿越）、NUL 字符、以 "/" 开头
 * - 限制在已知前缀之下（防止越权读写桶内任意对象）
 */
function isKeySafe(key) {
  if (!key || typeof key !== 'string') return false;
  if (key.includes('..') || key.includes('\0') || key.startsWith('/')) return false;
  return ALLOWED_PREFIXES.some(prefix => key.startsWith(prefix));
}

/** 从请求中读取 token，仅认 Authorization header（不再从 URL query 读取，避免泄露进日志） */
function getToken(request) {
  const header = request.headers.get('Authorization') || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return null;
}

/** fail-closed 鉴权：未配置 API_TOKEN 或 token 不匹配都拒绝 */
function isAuthorized(env, token) {
  if (!env.API_TOKEN) return false;
  return token === env.API_TOKEN;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || '';
    const requestOrigin = request.headers.get('Origin');

    // CORS 预检请求处理 - 必须在最前面
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...buildCorsHeaders(env, requestOrigin),
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    // 统一的 JSON CORS 响应头
    const corsHeaders = {
      ...buildCorsHeaders(env, requestOrigin),
      'Content-Type': 'application/json',
    };

    // 启动期校验：R2 绑定缺失时直接报错，而不是在每个请求里抛模糊的 500
    if (!env.R2_BUCKET) {
      return new Response(JSON.stringify({ error: 'R2 bucket not bound' }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    try {
      // ==================== 文件直接访问路径（/file/{key}）====================
      // 图片文件可公开访问（便于在 Markdown/笔记中 <img> 引用）；其他文件需 token。
      if (url.pathname.startsWith('/file/')) {
        const key = decodeURIComponent(url.pathname.substring(6)); // 去掉 '/file/' 前缀

        const isImageFile = IMAGE_EXTENSIONS.some(ext => key.toLowerCase().endsWith(ext));

        // 非图片文件需要 token 鉴权（fail-closed）
        if (!isImageFile) {
          const token = getToken(request);
          if (!isAuthorized(env, token)) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
              status: 401,
              headers: corsHeaders,
            });
          }
        }

        const object = await env.R2_BUCKET.get(key);

        if (!object) {
          return new Response(JSON.stringify({ error: 'File not found' }), {
            status: 404,
            headers: corsHeaders,
          });
        }

        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        // 可变内容（笔记/Markdown）不长期缓存，避免编辑后 CDN/浏览器返回旧内容；
        // 其余静态资源才用 1 年长缓存。
        if (key.startsWith('notes/') || key.startsWith('markdown_file/')) {
          headers.set('Cache-Control', 'no-cache');
        } else {
          headers.set('Cache-Control', 'public, max-age=31536000');
        }
        // 追加 CORS 头（buildCorsHeaders 内含 Vary: Origin）
        const fileCors = buildCorsHeaders(env, requestOrigin);
        Object.entries(fileCors).forEach(([k, v]) => headers.set(k, v));

        // Content-Disposition：图片 inline 展示，其他下载。
        // 同时给出 ASCII fallback 与 RFC 5987 编码的 filename*，避免 CJK 文件名被存成 %XX 字面量。
        const dispositionType = isImageFile ? 'inline' : 'attachment';
        const asciiName = key.split('/').pop() || key;
        const encodedFilename = encodeURIComponent(asciiName);
        headers.set(
          'Content-Disposition',
          `${dispositionType}; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`
        );

        return new Response(object.body, { headers });
      }

      // ==================== 全局 Token 验证（fail-closed）====================
      // 写操作（list/upload/delete/rename）一律要求 token。token 仅从 header 读取。
      const token = getToken(request);
      if (!isAuthorized(env, token)) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: corsHeaders,
        });
      }

      // ==================== API 操作 ====================

      // 列出文件 - 支持目录前缀过滤，并对超过单次上限(1000)的结果分页拉取
      if (action === 'list') {
        const body = await request.json().catch(() => ({}));
        const prefix = typeof body.prefix === 'string' ? body.prefix : '';
        const files = [];
        let cursor;
        // R2 list 单次最多返回 1000 条，这里循环拉完（避免大桶被静默截断）
        do {
          const listed = await env.R2_BUCKET.list({ prefix, cursor });
          for (const obj of listed.objects) {
            files.push({
              Key: obj.key,
              Size: obj.size,
              LastModified: obj.uploaded.toISOString(),
              ETag: obj.etag,
            });
          }
          cursor = listed.truncated ? listed.cursor : undefined;
        } while (cursor);

        return Response.json({ files }, { headers: corsHeaders });
      }

      // 上传文件
      if (action === 'upload' && request.method === 'POST') {
        const formData = await request.formData();
        const file = formData.get('file');
        const path = formData.get('path'); // 可选路径（包含目录）

        if (!file) {
          return new Response(JSON.stringify({ error: 'No file provided' }), {
            status: 400,
            headers: corsHeaders,
          });
        }

        const key = path || file.name;

        // key 安全校验：限制在已知前缀下，拒绝路径穿越
        if (!isKeySafe(key)) {
          return new Response(JSON.stringify({ error: 'Invalid file path' }), {
            status: 400,
            headers: corsHeaders,
          });
        }

        // 大小上限：超出直接拒绝，避免 OOM
        if (typeof file.size === 'number' && file.size > MAX_UPLOAD_BYTES) {
          return new Response(JSON.stringify({ error: 'File too large', maxBytes: MAX_UPLOAD_BYTES }), {
            status: 413,
            headers: corsHeaders,
          });
        }

        // 直接用流写入，避免把整个文件缓冲进内存
        await env.R2_BUCKET.put(key, file.stream(), {
          httpMetadata: { contentType: file.type },
        });

        return Response.json({
          success: true,
          key: key,
          path: path,
          message: 'File uploaded successfully',
        }, { headers: corsHeaders });
      }

      // 删除文件
      if (action === 'delete' && request.method === 'POST') {
        let body;
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
            status: 400,
            headers: corsHeaders,
          });
        }
        if (!isKeySafe(body.key)) {
          return new Response(JSON.stringify({ error: 'Invalid file path' }), {
            status: 400,
            headers: corsHeaders,
          });
        }
        await env.R2_BUCKET.delete(body.key);

        return Response.json({
          success: true,
          message: 'File deleted successfully',
        }, { headers: corsHeaders });
      }

      // 重命名文件（复制 + 删除）
      if (action === 'rename' && request.method === 'POST') {
        let body;
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
            status: 400,
            headers: corsHeaders,
          });
        }
        const { oldKey, newKey } = body;

        if (!oldKey || !newKey) {
          return new Response(JSON.stringify({ error: 'oldKey and newKey are required' }), {
            status: 400,
            headers: corsHeaders,
          });
        }
        if (!isKeySafe(oldKey) || !isKeySafe(newKey)) {
          return new Response(JSON.stringify({ error: 'Invalid file path' }), {
            status: 400,
            headers: corsHeaders,
          });
        }

        // 检查新文件名是否已存在
        const existing = await env.R2_BUCKET.head(newKey);
        if (existing) {
          return new Response(JSON.stringify({ error: 'Target file already exists' }), {
            status: 409,
            headers: corsHeaders,
          });
        }

        // 获取原文件
        const object = await env.R2_BUCKET.get(oldKey);
        if (!object) {
          return new Response(JSON.stringify({ error: 'Source file not found' }), {
            status: 404,
            headers: corsHeaders,
          });
        }

        // 用流复制到新位置（不把整个文件缓冲进内存）
        await env.R2_BUCKET.put(newKey, object.body, {
          httpMetadata: object.httpMetadata,
          customMetadata: object.customMetadata,
        });

        // 删除原文件；失败时如实返回，避免前端误以为完全成功而留下重复对象
        try {
          await env.R2_BUCKET.delete(oldKey);
        } catch (e) {
          return new Response(JSON.stringify({
            error: 'Renamed, but failed to delete the original; duplicate may exist',
            newKey,
            oldKey,
          }), {
            status: 500,
            headers: corsHeaders,
          });
        }

        return Response.json({
          success: true,
          oldKey,
          newKey,
          message: 'File renamed successfully',
        }, { headers: corsHeaders });
      }

      // 无效的操作
      return new Response(JSON.stringify({
        error: 'Invalid action',
        availableActions: ['list', 'upload', 'delete', 'rename'],
        note: '文件下载直接访问 /file/{key} 路径，非图片文件需在 Authorization header 中携带 token（图片文件可跳过验证）',
      }), {
        status: 400,
        headers: corsHeaders,
      });

    } catch (error) {
      console.error('Worker error:', error);
      // 不把内部错误信息（可能含绑定名/堆栈细节）回传给客户端
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: corsHeaders,
      });
    }
  },
};
