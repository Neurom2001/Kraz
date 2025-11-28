import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './'), // Maps '@' to the root directory
    },
  },
  build: {
    outDir: 'dist',
  },
});