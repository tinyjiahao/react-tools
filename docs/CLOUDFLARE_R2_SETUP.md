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

正式域名 `tool.searchdiff.com` 已从旧 Pages 项目迁移至 Worker `react-tools`，并在 `wrangler.jsonc` 的 `routes` 中声明。旧 Pages 项目保留历史部署，但已关闭生产和预览自动构建。不要再重试旧 Pages 流水线：它查找的 `build/` 已不再生成。

迁移其它 Pages 域名时，先解绑 Pages 自定义域名并移除其旧 CNAME，再绑定到 Worker；只更新本地代码不会解除旧域名占用。当前 R2 使用 `react-tools` 桶，旧桶数据不会自动迁入。

CI 使用 `npm ci` 后运行 `npm run deploy`，通过 CI Secrets 注入 CLOUDFLARE_API_TOKEN 和 CLOUDFLARE_ACCOUNT_ID。若平台单独运行构建阶段，部署命令使用 `npx wrangler deploy -c dist/worker/wrangler.json`。

## Git 自动发布

在 **Workers → react-tools → 设置 → 构建** 管理 Git 连接（不是同名的旧 Pages 项目）。

- 仓库：`tinyjiahao/react-tools`，生产分支：`main`。
- 根目录：`/`。
- 构建命令：`npm run build`。
- 部署命令：`npx wrangler deploy -c dist/worker/wrangler.json`。
- 构建凭据由 Cloudflare 的 Workers Builds 管理；运行时 `API_TOKEN` 仍作为 Worker Secret 单独配置。

推送 main 后由 Workers Builds 发布前后端与域名配置；构建状态应在 Worker 的部署记录中查看。
