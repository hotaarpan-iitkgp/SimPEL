import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    base: process.env.GITHUB_ACTIONS === 'true' ? '/SimPEL/' : '/',
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        // Use injectManifest so our custom src/sw.ts handles all fetch logic
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        registerType: 'prompt',           // Don't auto-update; show banner instead
        injectRegister: false,            // We register manually in main.tsx

        // Workbox injectManifest config
        injectManifest: {
          globPatterns: [
            '**/*.{js,css,html,ico,png,svg,woff,woff2,ttf}',
          ],
          globIgnores: ['**/node_modules/**'],
          maximumFileSizeToCacheInBytes: 15 * 1024 * 1024, // 15 MB limit
        },

        // Web App Manifest (merged with public/manifest.json)
        manifest: {
          name: 'SimPEL — Circuit Simulator Pro',
          short_name: 'SimPEL',
          description: 'High-performance offline schematic editor and circuit simulation suite. Runs fully offline after installation.',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          background_color: '#020617',
          theme_color: '#10b981',
          orientation: 'any',
          categories: ['productivity', 'education', 'utilities'],
          prefer_related_applications: false,
          icons: [
            {
              src: '/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any maskable',
            },
            {
              src: '/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable',
            },
          ],
        },

        devOptions: {
          enabled: false,
        },
      }),
    ],
    build: {
      chunkSizeWarningLimit: 5000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('plotly')) return 'vendor-plotly';
              if (id.includes('recharts') || id.includes('d3')) return 'vendor-charts';
              if (id.includes('lucide-react') || id.includes('motion')) return 'vendor-ui';
              if (id.includes('react') || id.includes('react-dom')) return 'vendor-react';
            }
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
