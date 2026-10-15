import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // @kanbit/shared is consumed as TypeScript source, so it must be bundled
  // for Railway to run plain `node dist/index.js`.
  noExternal: ['@kanbit/shared'],
});
