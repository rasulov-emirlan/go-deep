/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // the question bank is one ~900 kB JSON chunk, lazy-loaded on /interview
  build: { chunkSizeWarningLimit: 1000 },
  plugins: [react()],
  test: { include: ['src/**/*.test.ts', 'src/**/*.test.tsx'] },
})
