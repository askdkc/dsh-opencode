import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  outDir: 'lib',
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  platform: 'node',
  unbundle: true,
  external: [/^@deepseek-ai\//, /^@earendil-works\//],
})
