import { defineConfig } from 'vite';

export default defineConfig({
  assetsInclude: ['**/*.jpg', '**/*.png', '**/*.hdr', '**/*.wav'],
  build: {
    rollupOptions: {
      input: {
        main: './index.html'
      }
    },
    outDir: 'dist',
    assetsDir: 'assets'
  },
  server: {
    fs: {
      allow: ['.']
    }
  }
});