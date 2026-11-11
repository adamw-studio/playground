import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  // GitHub Pages serves this repo at https://adamw-studio.github.io/playground/
  base: command === 'build' ? '/playground/' : '/',
  plugins: [react()],
  // Only imported lazily (HEIC decoding, the tracing worker); pre-bundle them so the dev server
  // doesn't discover and re-optimize them mid-session.
  optimizeDeps: { include: ['heic-to', 'imagetracerjs'] },
  server: { port: 5188, strictPort: true },
}));
