import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// Vite config for local development and Vercel deployment.
// The original Figma Make plugins are intentionally removed because
// their configuration files are not part of this repository.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            {
              name: 'vendor-react',
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
            },
            {
              name: 'vendor-supabase',
              test: /node_modules[\\/]@supabase[\\/]/,
            },
          ],
        },
      },
    },
  },
  server: {
    host: true,
    port: parseInt(process.env.PORT || '5173'),
    strictPort: false,
  },
  preview: {
    host: true,
    port: parseInt(process.env.PORT || '4173'),
  },
})
