import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Relative base path so Vellum works seamlessly on GitHub Pages
// regardless of repository name (e.g. https://<user>.github.io/vellum/)
export default defineConfig({
  base: './',
  plugins: [react()],
});
