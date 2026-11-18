import { defineConfig } from 'vitest/config'

export default defineConfig({
   test: {
      // All integration test files run in parallel against one MongoDB; under that load an
      // HTTP-heavy test can pass the 5 s default (seen 2026-11-17 with 47 files). Alone they take < 1 s.
      // (Random 401s were a different cause: TTL sweeps, see src/test/db.ts.)
      testTimeout: 20_000,
   },
})
