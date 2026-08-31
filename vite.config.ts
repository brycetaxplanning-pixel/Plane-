import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Relative base so a build works from any static host — GitHub Pages project
// pages, a subdirectory, or opened straight off disk.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false },
});
