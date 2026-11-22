# Cloudflare Workers 统一部署

前端与 Hono API 使用同一个 Worker 发布，与 uranus 使用相同部署流程。无需创建 Pages 项目或单独复制 Worker 代码。

## 初始化

1. 运行 `npm ci`。
2. 编辑 `wrangler.jsonc`：设置应用 `name` 和 `R2_BUCKET` 的真实 `bucket_name`，可参考 `wrangler.example.jsonc`。不要照抄 uranus 的资源标识。
3. 首次部署先运行 `npx wrangler login`，使用已有 R2 桶或运行 `npx wrangler r2 bucket create <桶名>`。
4. 运行 `npx wrangler secret put API_TOKEN` 设置访问令牌，不要写入仓库或 VITE_* 变量。
5. 运行 `npm run deploy`。

部署脚本先类型检查和构建，再执行 `wrangler deploy -c dist/worker/wrangler.json`。Cloudflare Vite Plugin 生成的配置负责关联静态资源与 Worker。产物为 `dist/client` 和 `dist/worker`。

## 本地开发与预览

复制 `.dev.vars.example` 为 `.dev.vars`，设置本地 API_TOKEN。

- `npm run dev`：本地 Workers Runtime 与 Vite，端口 3000。
- `npm run build`：类型检查与前后端构建。
- `npm run preview`：预览构建后的 Worker 和静态资源。
- `npm run test:run`：现有单元测试。

本地 R2 使用模拟 binding，数据放在忽略提交的 `.wrangler` 目录，不访问生产桶。

## 路由与迁移

`/api` 和 `/api/*` 优先进入 Worker；其他路径使用静态资源和 SPA fallback，支持工具深链接刷新。已删除 Pages 专用的 `_redirects`、`_routes.json`。

存储请求使用同源 `/api`。当前鉴权仍为 Authorization Bearer API_TOKEN，未迁移为 uranus 的账号会话体系。浏览器设置中填写对应令牌。

已有 Pages 项目需要停止原部署流水线，并在确认新 Worker 可用后将自定义域名切换到该 Worker。此代码修改不会自动修改线上域名或迁移 R2 数据；绑定原桶可继续访问原对象。

CI 使用 `npm ci` 后运行 `npm run deploy`，通过 CI Secrets 注入 CLOUDFLARE_API_TOKEN 和 CLOUDFLARE_ACCOUNT_ID。若平台单独运行构建阶段，部署命令使用 `npx wrangler deploy -c dist/worker/wrangler.json`。
