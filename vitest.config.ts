import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // The offline suite must pass with no API key present. Anything needing a
    // key lives in tests/live.e2e.ts and runs under `npm run test:live`.
    exclude: ['tests/live.e2e.ts', 'node_modules/**'],
  },
})
