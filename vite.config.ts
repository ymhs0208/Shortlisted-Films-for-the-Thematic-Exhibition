import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  base: './',
  publicDir: 'site-public',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        poster: resolve(root, 'index.html'),
        gallery: resolve(root, 'gallery.html'),
        guide: resolve(root, 'guide.html'),
        videoStudio: resolve(root, 'video-studio/index.html'),
      },
    },
  },
});
