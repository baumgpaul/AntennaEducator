import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Fix for amazon-cognito-identity-js expecting Node.js globals
    global: 'globalThis',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/components': path.resolve(__dirname, './src/components'),
      '@/features': path.resolve(__dirname, './src/features'),
      '@/api': path.resolve(__dirname, './src/api'),
      '@/store': path.resolve(__dirname, './src/store'),
      '@/hooks': path.resolve(__dirname, './src/hooks'),
      '@/types': path.resolve(__dirname, './src/types'),
      '@/utils': path.resolve(__dirname, './src/utils'),
    },
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      // Auth endpoints -> auth service (port 8011)
      '/api/auth': {
        target: 'http://localhost:8011',
        changeOrigin: true,
      },
      // All other API endpoints -> projects service (port 8010)
      '/api': {
        target: 'http://localhost:8010',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Split heavy vendor libs into separate chunks for caching.
        // Function form: Vite 8 (rolldown) no longer accepts the object form.
        // Module ids use forward slashes on every OS.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (/\/node_modules\/(three|@react-three)\//.test(id)) return 'vendor-three'
          if (/\/node_modules\/@mui\//.test(id)) return 'vendor-mui'
          if (/\/node_modules\/recharts\//.test(id)) return 'vendor-charts'
          return undefined
        },
      },
    },
  },
})
