import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    cloudflare({ viteEnvironment: { name: "worker" } }),
  ],
  environments: { worker: { build: { sourcemap: true } } },
  server: {
    port: 3000,
  },
});
