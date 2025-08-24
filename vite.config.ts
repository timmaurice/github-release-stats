import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  // Set the base path for GitHub Pages deployment.
  // This should match the name of your repository.
  base: '/github-release-stats/',
  build: {
    outDir: 'dist',
  },
})
