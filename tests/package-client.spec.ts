import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

describe('generated Client artifact', () => {
  it('contains only loader registration at top level and the right module id', async () => {
    const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
    expect(source).toContain("__ModuleLoader__.load({id:'dsh-opencode'")
    expect(source).toContain('factory:')
    expect(source).toContain('return module.exports')
    expect(source).not.toContain('node:fs')
    expect(source).not.toContain('src/keyring')
  })

  it('registers without running Client setup at module evaluation time', async () => {
    const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
    let loaded: { id?: string; factory?: (require: (name: string) => unknown) => unknown } | undefined
    runInNewContext(source, {
      window: { __ModuleLoader__: { load: (entry: typeof loaded) => { loaded = entry } } },
    })
    expect(loaded?.id).toBe('dsh-opencode')
    expect(typeof loaded?.factory).toBe('function')
    const requires: string[] = []
    const module = loaded?.factory?.((name: string) => {
      requires.push(name)
      if (name === 'react' || name === 'react/jsx-runtime') return { createElement: () => null, jsx: () => null, jsxs: () => null, Fragment: Symbol('Fragment'), useState: () => [undefined, () => undefined], useEffect: () => undefined, useSyncExternalStore: () => ({ open: false }) }
      if (name === '@deepseek-ai/dsh-client-ui-primitives') return { Button: () => null, Modal: () => null }
      throw new Error(`unexpected dependency ${name}`)
    }) as { apply?: unknown }
    expect(typeof module.apply).toBe('function')
    expect(requires).toContain('react')
    expect(requires).toContain('@deepseek-ai/dsh-client-ui-primitives')
  })
})
