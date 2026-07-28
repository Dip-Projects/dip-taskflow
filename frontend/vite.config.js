import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      react(),
      {
        name: 'tf-config-dev',
        configureServer(server) {
          server.middlewares.use('/config.js', (_req, res) => {
            const payload = {
              supabaseUrl: env.VITE_SUPABASE_URL || '',
              supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY || '',
              apiBase: '/api',
            };
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
            res.end(`window.__TF_CONFIG__=${JSON.stringify(payload)};`);
          });
        },
      },
    ],
    server: {
      port: 5173,
      proxy: {
        '/api': { target: 'http://localhost:4000', changeOrigin: true },
        '/legacy': { target: 'http://localhost:4000', changeOrigin: true },
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  };
});
