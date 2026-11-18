import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const API_TARGET = process.env.LUMEN_API_URL ?? 'http://localhost:8787';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 管理后台挂在 /admin/ 下，与 web 同源部署时不会抢路由
  base: '/admin/',
  server: {
    port: Number(process.env.LUMEN_ADMIN_PORT ?? 5274),
    strictPort: false,
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
