# Cloudflare Workers + R2 存储配置指南

本文档详细介绍如何使用 Cloudflare Workers 作为代理服务器访问 Cloudflare R2 对象存储。

## 目录

1. [前置条件](#前置条件)
2. [创建 R2 存储桶](#创建-r2-存储桶)
3. [方法选择](#方法选择)
4. [方法一：通过 Dashboard 创建 Workers（推荐）](#方法一通过-dashboard-创建-workers推荐)
5. [方法二：使用 Wrangler CLI](#方法二使用-wrangler-cli)
6. [编写 Workers 代码](#编写-workers-代码)
7. [添加身份验证](#添加身份验证)
8. [配置前端应用](#配置前端应用)
9. [常见问题排查](#常见问题排查)

---

## 前置条件

在开始之前，请确保您已准备好：

- **Cloudflare 账户**：注册免费的 Cloudflare 账户 [https://dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)

> **提示**：如果您选择使用 Dashboard 方法创建 Workers，**不需要**安装 Node.js 或任何命令行工具。如果您选择使用 Wrangler CLI 方法，则需要 Node.js 环境。

---

## 创建 R2 存储桶

### 步骤 1：启用 R2 服务

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 在左侧导航栏选择 **R2**
3. 如果是首次使用，点击 **启用 R2** 按钮

### 步骤 2：创建存储桶

1. 点击 **创建存储桶** 按钮
2. 填写存储桶信息：
   - **存储桶名称**：例如 `my-app-files`（全局唯一）
   - **位置**：选择离用户最近的位置以获得最佳性能
3. 点击 **创建存储桶**

### 步骤 3：配置存储桶（可选）

- **公开展示**：如需直接访问文件，可配置自定义域名
- **生命周期规则**：设置自动删除过期文件
- **版本控制**：启用文件版本管理

---

## 方法选择

Cloudflare 提供两种方式来创建和配置 Workers：

| 特性 | 方法一：Dashboard（推荐） | 方法二：Wrangler CLI |
|------|-------------------------|---------------------|
| **难易程度** | 简单，完全可视化 | 中等，需要命令行操作 |
| **环境要求** | 仅需浏览器 | 需要 Node.js 环境 |
| **适合场景** | 快速部署、简单项目 | 复杂项目、团队协作、CI/CD |
| **本地开发** | 不支持 | 支持 |
| **版本控制** | 手动管理 | Git 集成 |

**推荐**：如果您是首次使用或项目简单，建议使用 **方法一（Dashboard）**。

---

## 方法一：通过 Dashboard 创建 Workers（推荐）

这种方法完全通过 Cloudflare 的网页界面操作，无需安装任何工具。

### 步骤 1：创建 Worker

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 在左侧导航栏选择 **Workers & Pages**
3. 如果是首次使用，点击 **创建应用程序** 按钮
4. 选择 **创建 Worker** → **点击"创建"**
5. 输入 Worker 名称，例如：`r2-worker-proxy`
6. 点击 **部署** 按钮创建 Worker

### 步骤 2：编写 Worker 代码

1. 创建成功后，点击 **编辑代码** 按钮
2. 您将进入在线代码编辑器
3. 删除默认代码，复制以下完整代码：

```javascript
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
      // 列出文件
      if (action === 'list') {
        const listed = await env.R2_BUCKET.list();
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
        availableActions: ['list', 'upload', 'delete'],
        note: '文件下载直接访问 /file/{key} 路径，需在 Authorization header 中携带 token'
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
```

4. 点击右上角 **保存并部署** 按钮

### 步骤 3：绑定 R2 存储桶

1. 在 Worker 编辑页面，点击 **设置** 标签
2. 向下滚动到 **绑定** 部分
3. 点击 **添加绑定** → 选择 **R2 存储桶**
4. 填写绑定信息：
   - **变量名称**：`R2_BUCKET`（必须与代码中的 `env.R2_BUCKET` 一致）
   - **R2 存储桶**：从下拉菜单选择您之前创建的存储桶（如 `my-app-files`）
5. 点击 **保存**

### 步骤 4：设置 API Token（可选）

如果需要添加身份验证：

1. 在 **设置** 标签中，找到 **变量和密钥** 部分
2. 点击 **添加变量** → 选择 **加密（密钥）**
3. **变量名称**：`API_TOKEN`
4. **值**：输入您的 Token（例如：`your-secret-token-12345`）
5. 点击 **保存**

> **安全提示**：请使用强随机字符串作为 Token，可以使用在线工具生成。

### 步骤 5：获取 Worker URL

1. 返回 Worker 页面
2. URL 显示格式为：`https://r2-worker-proxy.your-subdomain.workers.dev`
3. 复制此 URL 用于前端配置

### 步骤 6：测试 Worker

在浏览器中或使用 curl 测试：

```bash
# 测试列出文件
curl -X POST https://r2-worker-proxy.your-subdomain.workers.dev?action=list
```

如果返回 JSON 响应（即使是空的文件列表），说明配置成功！

---

## 方法二：使用 Wrangler CLI

如果您更喜欢使用命令行工具进行开发，Wrangler CLI 提供了更强大的功能。

### 安装和配置 Wrangler CLI

Wrangler 是 Cloudflare 的官方命令行工具，用于开发和部署 Workers。

#### 安装 Wrangler

```bash
npm install -g wrangler
```

#### 登录 Cloudflare

```bash
wrangler login
```

执行后会打开浏览器，授权 Wrangler 访问您的 Cloudflare 账户。

#### 验证安装

```bash
wrangler --version
# 应显示版本号，例如 wrangler 3.x.x
```

### 创建和配置 Workers 项目

#### 初始化项目

```bash
# 创建项目目录
mkdir r2-worker-proxy
cd r2-worker-proxy

# 初始化 Workers 项目
wrangler init r2-worker
```

选择以下选项：
- **What would you like to start with?** → "Hello World" Worker
- **What do you want to name your Worker?** → r2-worker-proxy

#### 项目结构

```
r2-worker-proxy/
├── src/
│   └── index.ts      # Workers 代码主文件
├── wrangler.toml     # Workers 配置文件
├── package.json
└── tsconfig.json
```

#### 编辑 Worker 代码

编辑 `src/index.ts`，使用与方法一相同的代码（参见上方 **方法一** 中的代码示例）。

#### 配置 wrangler.toml

`wrangler.toml` 是 Workers 的配置文件，定义了项目设置、环境变量和绑定。

编辑 `wrangler.toml`：

```toml
name = "r2-worker-proxy"
main = "src/index.ts"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

# R2 存储桶绑定
[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "my-app-files"  # 替换为你的存储桶名称

# 环境变量（可选，用于 API Token）
[vars]
# 如果需要 Token 验证，使用 secrets 命令添加更安全
# API_TOKEN = "your-api-token-here"

# 生产环境配置
[env.production]
name = "r2-worker-proxy"

# 开发环境配置
[env.development]
name = "r2-worker-proxy-dev"
```

#### 设置 API Token Secret（推荐）

如果需要使用 Token 验证，使用 wrangler secret 命令安全存储：

```bash
# 设置生产环境 Token
wrangler secret put API_TOKEN

# 设置开发环境 Token
wrangler secret put API_TOKEN --env development
```

执行后输入您的 Token 值。

#### 部署到 Cloudflare

**本地测试**（可选）：
```bash
# 启动本地开发服务器
wrangler dev

# 访问 http://localhost:8787 测试 API
```

**部署到生产环境**：
```bash
wrangler deploy
```

部署成功后会显示 Workers URL：

```
✨ Successfully published your Worker to
  https://r2-worker-proxy.your-subdomain.workers.dev
```

---

## 添加身份验证

Workers 支持多种身份验证方式。

### 方式 1：Bearer Token（推荐）

使用 Bearer Token 进行简单验证：

```bash
# 生成随机 Token
openssl rand -base64 32
# 或使用在线工具生成随机字符串
# 例如: aB3xK9mP2qL7vN5wR8sT4uY1cZ6dE0fH
```

将生成的 Token 设置为 secret（方法一：通过 Dashboard 设置；方法二：通过 wrangler 命令设置）。

### 方式 2：API Key + 请求签名

实现更复杂的签名验证逻辑：

```javascript
// 在 Workers 代码中添加签名验证
function verifySignature(payload, signature, secret) {
  const expectedSignature = hmacSha256(payload, secret);
  return signature === expectedSignature;
}
```

### 方式 3：Cloudflare Access

集成 Cloudflare Access 进行企业级身份管理。

---

## 配置前端应用

将 Workers URL 配置到前端应用中。

### 获取 Worker URL

无论使用哪种方法，部署成功后您都会获得 Worker URL：

**格式**：`https://<worker-name>.<your-subdomain>.workers.dev`

**示例**：`https://r2-worker-proxy.your-subdomain.workers.dev`

### 方式 1：通过 UI 配置（推荐）

1. 打开应用，进入 **R2 文件管理** 工具
2. 在配置页面输入：
   - **Workers URL**: `https://r2-worker-proxy.your-subdomain.workers.dev`
   - **API Token**: 您设置的 Token（可选）
3. 点击 **保存配置**

### 方式 2：通过 localStorage 配置

在浏览器控制台执行：

```javascript
localStorage.setItem('r2_config', JSON.stringify({
  workerUrl: 'https://r2-worker-proxy.your-subdomain.workers.dev',
  apiToken: 'your-api-token-here'  // 可选
}));
```

### API 端点说明

| 操作 | 方法 | 端点 | 说明 |
|------|------|------|------|
| 列出文件 | POST | `?action=list` | 获取所有文件列表 |
| 上传文件 | POST | `?action=upload` | 上传单个文件（FormData） |
| 删除文件 | POST | `?action=delete` | 删除指定文件（JSON body） |
| 下载文件 | GET | `/file/{key}` | 直接访问文件下载路径（需在 Authorization header 中携带 token） |

> **安全设计说明**：
> - 复制 URL 功能返回的链接**不包含** API token，适合分享给他人
> - 下载功能通过 `fetch()` + Authorization header 实现，token 不会暴露在 URL 中
> - 这种设计避免了 token 泄漏到浏览器历史、服务器日志等地方
> - 复制的链接如果需要访问，需要前端应用使用 token 重新发起请求

### 请求示例

```bash
# 列出文件
curl -X POST \
  'https://r2-worker-proxy.your-subdomain.workers.dev?action=list' \
  -H 'Authorization: Bearer your-api-token'

# 上传文件
curl -X POST \
  'https://r2-worker-proxy.your-subdomain.workers.dev?action=upload&authorization=your-api-token' \
  -F 'file=@/path/to/file.jpg'

# 删除文件
curl -X POST \
  'https://r2-worker-proxy.your-subdomain.workers.dev?action=delete' \
  -H 'Authorization: Bearer your-api-token' \
  -H 'Content-Type: application/json' \
  -d '{"key":"file.jpg"}'

# 下载文件（token 在 Authorization header 中）
curl -X GET \
  'https://r2-worker-proxy.your-subdomain.workers.dev/file/file.jpg' \
  -H 'Authorization: Bearer your-api-token' \
  -O
```

---

## 安全架构说明

### URL 复制 vs 文件下载的安全设计

本工具采用了分离的安全设计，平衡了**易用性**和**安全性**：

#### 1. URL 复制功能
- **返回格式**：`https://your-worker.workers.dev/file/filename.jpg`
- **特点**：**不包含** API token
- **用途**：适合分享给他人、存储到文档中、或用于需要公开访问的场景
- **访问方式**：直接在浏览器打开此链接需要 Worker 的 `/file/` 路由支持公开访问或使用其他验证方式

#### 2. 文件下载功能
- **实现方式**：使用 `fetch()` + `Authorization: Bearer {token}` header
- **特点**：token 放在 HTTP header 中，**不会暴露**在 URL 里
- **安全性**：
  - ✅ 不会出现在浏览器历史记录
  - ✅ 不会被服务器访问日志记录
  - ✅ 分享链接时不会意外泄露 token
  - ✅ 避免网络传输过程中的 URL 泄露风险

#### 3. 安全对比

| 方式 | Token 位置 | 安全风险 | 适用场景 |
|------|-----------|---------|---------|
| **URL 参数**（旧方式） | `?authorization=xxx` | ❌ 浏览器历史<br/>❌ 服务器日志<br/>❌ 分享泄露 | 不推荐 |
| **HTTP Header**（当前方式） | `Authorization: Bearer xxx` | ✅ 无 URL 泄露风险 | 推荐 |
| **无 Token**（复制 URL） | 无 | ⚠️ 需配置公开访问或签名 URL | 分享场景 |

#### 4. 实现原理

**前端下载流程**：
```typescript
// 1. 发起带 token 的请求
const response = await fetch(fileUrl, {
  headers: { 'Authorization': `Bearer ${config.apiToken}` }
});

// 2. 转换为 blob 并触发下载
const blob = await response.blob();
const url = window.URL.createObjectURL(blob);
// 触发浏览器下载...
```

**Worker 验证流程**：
```javascript
// 从 Authorization header 读取 token
const token = request.headers.get('Authorization')?.replace('Bearer ', '');
if (env.API_TOKEN && token !== env.API_TOKEN) {
  return new Response('Unauthorized', { status: 401 });
}
```

---

## 常见问题排查

### 问题 1：Dashboard 方法 - 找不到 Workers & Pages 入口

**症状**：在 Dashboard 左侧导航栏找不到 Workers & Pages

**解决方案**：
1. 确保您的 Cloudflare 账户已启用 Workers 服务
2. Workers 对免费账户有每日请求限制，但可以正常使用
3. 尝试直接访问 URL: `https://dash.cloudflare.com/<account-id>/workers`

### 问题 2：Dashboard 方法 - 绑定 R2 后仍然报错

**症状**：Workers 返回 `R2_BUCKET is not defined`

**解决方案**：
1. 确认绑定的变量名称是 `R2_BUCKET`（必须与代码中完全一致）
2. 检查是否选择了正确的 R2 存储桶
3. 保存绑定后，需要点击 **保存并部署** 才能生效
4. 在 Worker 的 **资源** 标签中确认绑定已生效

### 问题 3：Dashboard 方法 - 代码保存失败

**症状**：点击保存后报错

**解决方案**：
1. 检查代码语法是否正确
2. 确保没有使用不支持的 API
3. 查看编辑器底部的错误提示

### 问题 4：CLI 方法 - Wrangler 部署失败

**症状**：`wrangler deploy` 返回错误

**解决方案**：
1. 确保已登录：`wrangler login`
2. 检查 `wrangler.toml` 配置是否正确
3. 更新 Wrangler 版本：`npm update -g wrangler`

### 问题 5：CORS 错误

**症状**：浏览器控制台显示跨域请求被阻止

**解决方案**：
1. 确保 Workers 代码中正确设置了 CORS 响应头
2. 检查 `Access-Control-Allow-Origin` 是否为 `*` 或您的域名

```javascript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
```

### 问题 6：401 Unauthorized

**症状**：API 返回 401 错误

**解决方案**：
1. 检查 API Token 是否正确
2. Dashboard 方法：确认在 **变量和密钥** 中正确设置了 `API_TOKEN`
3. CLI 方法：确认通过 `wrangler secret put API_TOKEN` 设置了 Token
4. 验证请求头格式：`Authorization: Bearer <token>`

### 问题 7：文件上传失败

**症状**：上传请求返回错误

**解决方案**：
1. 检查文件大小是否超过限制（R2 单文件最大 5TB）
2. 确保使用 FormData 格式上传
3. Dashboard 方法：在 Worker 的 **日志** 标签中查看实时日志
4. CLI 方法：使用 `wrangler tail` 查看日志

```bash
# CLI 方法 - 实时查看 Workers 日志
wrangler tail
```

### 问题 8：存储桶未绑定

**症状**：Workers 返回 `R2_BUCKET is not defined`

**解决方案**：

**Dashboard 方法**：
1. 在 Worker 设置页面，检查 **绑定** 部分
2. 确认变量名称为 `R2_BUCKET`
3. 确认选择了正确的存储桶
4. 点击 **保存并部署**

**CLI 方法**：
检查 `wrangler.toml` 中的 R2 绑定配置：

```toml
[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "your-actual-bucket-name"
```

### 问题 9：文件无法公开访问

**症状**：获取的 URL 无法在浏览器中打开

**解决方案**：
1. 配置 R2 存储桶的自定义域名
2. 或实现签名 URL 生成逻辑

**配置自定义域名**：
1. 在 Cloudflare Dashboard 中进入 R2 存储桶设置
2. 点击 **设置** → **公开展示**
3. 添加自定义域名并按提示配置 DNS

### 问题 10：复制链接无法直接下载（401 Unauthorized）

**症状**：点击"复制 URL"按钮后，复制的链接在浏览器中打开显示 401 错误

**原因**：这是**预期行为**，是安全设计的一部分。复制的链接不包含 token，因此无法直接访问。

**解决方案**：
- **方案 1**：在 Worker 中配置公开访问（移除 `/file/` 路由的 token 验证）
- **方案 2**：使用前端应用的"下载"按钮功能（会自动携带 token）
- **方案 3**：如果需要分享文件给他人，配置 R2 存储桶的自定义域名实现公开访问

```javascript
// 如果需要公开访问文件，修改 Worker 代码移除 token 验证
if (url.pathname.startsWith('/file/')) {
  // 移除或注释掉以下验证代码即可实现公开访问
  // if (env.API_TOKEN && token !== env.API_TOKEN) {
  //   return new Response('Unauthorized', { status: 401 });
  // }
  const key = decodeURIComponent(url.pathname.substring(6));
  // ...
}
```

---

## 方法对比总结

| 操作 | Dashboard 方法 | CLI 方法 |
|------|--------------|----------|
| 创建 Worker | 点击按钮，填写名称 | `wrangler init` |
| 编辑代码 | 在线编辑器 | 本地编辑器（VS Code 等） |
| 绑定 R2 | 页面配置 | 编辑 `wrangler.toml` |
| 设置 Token | 页面配置 Secrets | `wrangler secret put` |
| 部署 | 点击保存并部署 | `wrangler deploy` |
| 查看日志 | 页面实时日志 | `wrangler tail` |
| 版本控制 | 手动备份 | Git 集成 |

---

## 高级配置

### 配置自定义域名

1. **在 Cloudflare 添加域名**：
   - 进入 R2 存储桶 → 设置 → 公开展示
   - 添加域名（如 `files.yourdomain.com`）
   - 按提示配置 DNS 记录

2. **更新 Workers 代码**：

```typescript
const publicUrl = `https://files.yourdomain.com/${body.key}`;
```

### 限制访问来源

在 Workers 中添加 Referer 检查：

```typescript
const allowedOrigins = ['https://yourdomain.com', 'https://www.yourdomain.com'];
const origin = request.headers.get('Origin');

if (!allowedOrigins.includes(origin)) {
  return new Response('Forbidden', { status: 403 });
}
```

### 设置速率限制

使用 Cloudflare Workers KV 存储实现速率限制：

```typescript
// 在 wrangler.toml 中添加 KV 绑定
[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "your-kv-namespace-id"

// 在 Workers 代码中实现
async function checkRateLimit(ip: string): Promise<boolean> {
  const key = `rate_limit:${ip}`;
  const count = await env.RATE_LIMIT.get(key);
  // ... 速率限制逻辑
}
```

---

## 参考资源

- [Cloudflare R2 文档](https://developers.cloudflare.com/r2/)
- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
- [Wrangler CLI 文档](https://developers.cloudflare.com/workers/wrangler/)
- [R2 API 参考](https://developers.cloudflare.com/r2/api/workers/r2-bucket/)

---

## 许可证

本文档基于 MIT 许可证发布。
