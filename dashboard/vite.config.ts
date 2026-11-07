import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Output goes straight into the Helm chart. Files are flat (no sub-folders)
// because they are served from a ConfigMap, and paths are relative so the app
// works under any branch path, e.g. /paznaun-demand-radar/.
export default defineConfig({
  plugins: [react()],
  base: './',
  // Local dev: the API service (npm run server) answers under /api.
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
  build: {
    outDir: '../helm/tourism-technology/site',
    emptyOutDir: true,
    assetsDir: '',
    chunkSizeWarningLimit: 700,
  },
});
