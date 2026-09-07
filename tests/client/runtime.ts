import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import * as cordis from '@deepseek-ai/cordis'
import * as slots from '@deepseek-ai/dsh-client-ui-slots'
import type { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'

const require = createRequire(import.meta.url)
const reactRequire = createRequire(require.resolve('@deepseek-ai/dsh-client-ui-primitives/package.json'))
const seeds: Record<string, unknown> = {
  react: require('react'),
  'react/jsx-runtime': require('react/jsx-runtime'),
  'react-dom': reactRequire('react-dom'),
  'react-dom/client': reactRequire('react-dom/client'),
  '@deepseek-ai/cordis': cordis,
  '@deepseek-ai/dsh-client-ui-slots': slots,
}

/** Execute the shipped browser factory using actual Harness platform seeds. */
export async function clientModule<T>(path: string | URL): Promise<T> {
  let factory!: (require: (name: string) => unknown) => T
  runInNewContext(await readFile(path, 'utf8'), {
    window: { __ModuleLoader__: { load: (entry: { factory: typeof factory }) => { factory = entry.factory } } },
    queueMicrotask, console, setTimeout, clearTimeout,
  })
  return factory(name => {
    if (!(name in seeds)) throw new Error(`Client dependency has no platform seed or registered factory: ${name}`)
    return seeds[name]
  })
}

export async function registryPlugin(): Promise<typeof SlotRegistry> {
  const module = await clientModule<{ SlotRegistry: typeof SlotRegistry }>(require.resolve('@deepseek-ai/dsh-client-ui-renderer/client'))
  return module.SlotRegistry
}
