import { defineConfig } from 'vite';

// Relative base so `dist/` works from any sub-path (GitHub Pages, a uni web server…).
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1200 },
});
