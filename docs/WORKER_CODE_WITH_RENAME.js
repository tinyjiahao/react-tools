// Cloudflare Worker 代码 - 支持目录前缀过滤和文件重命名
// 将此代码复制到 Cloudflare Worker 的编辑器中

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || '';

    // CORS 预检请求处理 - 必须在最前面
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    // 设置 CORS 响应头
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
    };

    // 验证 Token（可选）
    const token = url.searchParams.get('authorization') ||
                  request.headers.get('Authorization')?.replace('Bearer ', '');
    if (env.API_TOKEN && token !== env.API_TOKEN) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: corsHeaders
      });
    }

    try {
      // 列出文件 - 支持目录前缀过滤
      if (action === 'list') {
        const body = await request.json().catch(() => ({}));
        const prefix = body.prefix || '';
        const listed = await env.R2_BUCKET.list({ prefix });
        return Response.json({
          files: listed.objects.map(obj => ({
            Key: obj.key,
            Size: obj.size,
            LastModified: obj.uploaded.toISOString(),
            ETag: obj.etag,
          }))
        }, { headers: corsHeaders });
      }

      // 上传文件
      if (action === 'upload' && request.method === 'POST') {
        const formData = await request.formData();
        const file = formData.get('file');

        if (!file) {
          return new Response(JSON.stringify({ error: 'No file provided' }), {
            status: 400,
            headers: corsHeaders,
          });
        }

        await env.R2_BUCKET.put(file.name, file.stream(), {
          httpMetadata: { contentType: file.type }
        });

        return Response.json({
          success: true,
          key: file.name,
          message: 'File uploaded successfully'
        }, { headers: corsHeaders });
      }

      // 删除文件
      if (action === 'delete' && request.method === 'POST') {
        const body = await request.json();
        await env.R2_BUCKET.delete(body.key);

        return Response.json({
          success: true,
          message: 'File deleted successfully'
        }, { headers: corsHeaders });
      }

      // 重命名文件（复制+删除）
      if (action === 'rename' && request.method === 'POST') {
        const body = await request.json();
        const { oldKey, newKey } = body;

        if (!oldKey || !newKey) {
          return new Response(JSON.stringify({ error: 'oldKey and newKey are required' }), {
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

        // 读取原文件内容并复制到新位置
        const chunks = [];
        const reader = object.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        const fileContent = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
        let offset = 0;
        for (const chunk of chunks) {
          fileContent.set(chunk, offset);
          offset += chunk.length;
        }

        // 复制到新位置
        await env.R2_BUCKET.put(newKey, fileContent, {
          httpMetadata: object.httpMetadata,
          customMetadata: object.customMetadata,
        });

        // 删除原文件
        await env.R2_BUCKET.delete(oldKey);

        return Response.json({
          success: true,
          oldKey,
          newKey,
          message: 'File renamed successfully'
        }, { headers: corsHeaders });
      }

      // 直接访问文件 (通过 Worker 代理)
      if (url.pathname.startsWith('/file/')) {
        // 验证 Token (从 Authorization header 获取)
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (env.API_TOKEN && token !== env.API_TOKEN) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            }
          });
        }

        const key = decodeURIComponent(url.pathname.substring(6)); // 去掉 '/file/' 前缀
        const object = await env.R2_BUCKET.get(key);

        if (!object) {
          return new Response('File not found', {
            status: 404,
            headers: {
              'Access-Control-Allow-Origin': '*',
            }
          });
        }

        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        headers.set('Cache-Control', 'public, max-age=31536000'); // 缓存 1 年
        headers.set('Access-Control-Allow-Origin', '*'); // 添加 CORS 头

        // 设置 Content-Disposition 以便浏览器正确处理文件名
        const encodedFilename = encodeURIComponent(key);
        headers.set('Content-Disposition', `attachment; filename="${encodedFilename}"`);

        return new Response(object.body, { headers });
      }

      // 无效的操作
      return new Response(JSON.stringify({
        error: 'Invalid action',
        availableActions: ['list', 'upload', 'delete', 'rename'],
        note: '文件下载直接访问 /file/{key} 路径，需在 Authorization header 中携带 token',
        newFeatures: 'list 操作支持 prefix 参数指定目录，如 { prefix: "markdown_file/" }'
      }), {
        status: 400,
        headers: corsHeaders,
      });

    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({
        error: 'Internal server error',
        message: error.message || 'Unknown error'
      }), {
        status: 500,
        headers: corsHeaders,
      });
    }
  },
};
