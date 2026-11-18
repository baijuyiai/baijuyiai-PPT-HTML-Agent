import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const API_TARGET = process.env.LUMEN_API_URL ?? 'http://localhost:8787';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.LUMEN_WEB_PORT ?? 5273),
    strictPort: false,
    // 开发期把 /api 与 /files 反代到 API，避免 CORS 与 cookie 作用域问题
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/files': { target: API_TARGET, changeOrigin: true },
      // 样机配图库由 api 静态托管，浏览器只认一个来源
      '/stock': { target: API_TARGET, changeOrigin: true },
      // 随仓库分发的拉丁字体，同样由 api 托管
      '/fonts': { target: API_TARGET, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
});
