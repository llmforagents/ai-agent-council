import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**', 'src/application/**', 'src/infrastructure/**'],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 75 },
    },
  },
})
