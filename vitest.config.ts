import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    globals: false,
    testTimeout: 30000,
    hookTimeout: 60000,
    // Os testes que falam com o Supabase local compartilham estado; rodam em
    // sequencia para nao disputar as mesmas contas.
    fileParallelism: false,
    env: { TZ: 'UTC' },
  },
});
