import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  // GitHub Pages serves this repo at https://adamw-studio.github.io/playground/
  base: command === 'build' ? '/playground/' : '/',
  plugins: [react()],
  server: { port: 5188, strictPort: true },
}));
