import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// base must match the GitHub Pages project path (github.com/<org>/mallet-42k ->
// <org>.github.io/mallet-42k/) in production; dev server stays at root.
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/mallet-42k/' : '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000, // CI runners are ~2x slower than local; heavy engine tests (charge search) exceed 5s there
  },
}))
