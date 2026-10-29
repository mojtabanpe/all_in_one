import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC emits decorator metadata, which Nest's DI needs and esbuild cannot produce.
export default defineConfig({
  root: __dirname,
  cacheDir: '../../../../node_modules/.vite/libs/applets/english-learning/api',
  resolve: { tsconfigPaths: true },
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    name: 'english-learning-api',
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    reporters: ['default'],
    coverage: {
      reportsDirectory:
        '../../../../coverage/libs/applets/english-learning/api',
      provider: 'v8',
    },
  },
});
