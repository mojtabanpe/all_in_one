import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC emits decorator metadata, which Nest's DI needs and esbuild cannot produce.
export default defineConfig({
  root: __dirname,
  cacheDir: '../../../../node_modules/.vite/libs/applets/planner/api',
  resolve: { tsconfigPaths: true },
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    name: 'planner-api',
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../../coverage/libs/applets/planner/api',
      provider: 'v8',
    },
  },
});
