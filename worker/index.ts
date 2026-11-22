import { Hono } from 'hono';
import storage from './services/storage.js';

const app = new Hono();
app.all('/api/*', async (c) => {
  const url = new URL(c.req.url);
  url.pathname = url.pathname.slice(4) || '/';
  return storage.fetch(new Request(url, c.req.raw), c.env, c.executionCtx);
});
app.notFound((c) => c.json({ error: '接口不存在' }, 404));
export default app;
