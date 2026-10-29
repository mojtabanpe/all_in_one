import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir:
    '../../../../node_modules/.vite/libs/applets/english-learning/contracts',
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    name: 'english-learning-contracts',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory:
        '../../../../coverage/libs/applets/english-learning/contracts',
      provider: 'v8' as const,
    },
  },
}));
