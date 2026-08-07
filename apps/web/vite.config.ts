import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const sharedSrc = fileURLToPath(new URL('../../packages/shared/src', import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@timewar/shared': sharedSrc,
      '@shared': sharedSrc,
      '@engine': fileURLToPath(new URL('../server/src/engine', import.meta.url)),
    },
  },
  server: { port: 5215 },
  build: { outDir: 'dist', sourcemap: false },
});
