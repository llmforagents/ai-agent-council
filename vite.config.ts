import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [react()],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    server: {
      port: 4302,
      strictPort: true,
      host: true,
      proxy: {
        '/proxy/api': {
          target: env.VITE_API_BASE ?? 'https://api.llm4agents.com',
          changeOrigin: true,
          secure: true,
          rewrite: (p) => p.replace(/^\/proxy\/api/, ''),
        },
      },
    },
    preview: { port: 4312, strictPort: true, host: true },
  }
})
