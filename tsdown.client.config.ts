import { defineConfig } from 'tsdown'

// The loader evaluates this generated CommonJS body inside its factory. No
// Client registration runs until the returned module's apply() is called.
export default defineConfig({
  entry: { client: 'src/client/index.ts' },
  format: ['cjs'],
  dts: true,
  clean: false,
  outDir: 'lib',
  platform: 'browser',
  target: 'es2022',
  unbundle: false,
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  external: [/^react(?:\/|$)/, /^react-dom(?:\/|$)/],
  banner: { js: "window.__ModuleLoader__.load({id:'dsh-opencode',factory:(require)=>{var module={exports:{}};var exports=module.exports;" },
  footer: { js: 'return module.exports;}});' },
})
