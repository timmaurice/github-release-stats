import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  // Set the base path for GitHub Pages deployment.
  // This should match the name of your repository.
  base: '/github-release-stats/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'GitHub Release Stats',
        short_name: 'GH Release Stats',
        description: 'Compare download statistics for GitHub releases.',
        theme_color: '#212529',
        background_color: '#ffffff',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone'],
        start_url: '/github-release-stats/',
        scope: '/github-release-stats/',
        id: '/github-release-stats/',
        protocol_handlers: [
          {
            protocol: 'web+ghstats',
            url: '/github-release-stats/?repos=%s',
          },
        ],
        screenshots: [
          {
            src: 'screenshot-desktop.png',
            sizes: '1280x1519',
            type: 'image/png',
            form_factor: 'wide',
          },
          {
            src: 'screenshot-mobile.png',
            sizes: '860x1934',
            type: 'image/png',
          },
        ],
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('chart.js') || id.includes('chartjs-')) {
            return 'vendor-chartjs'
          }
          if (id.includes('@octokit')) {
            return 'vendor-octokit'
          }
          if (
            id.includes('node_modules/lit') ||
            id.includes('node_modules/@lit')
          ) {
            return 'vendor-lit'
          }
          if (id.includes('node_modules/bootstrap')) {
            return 'vendor-bootstrap'
          }
        },
      },
    },
  },
})
