import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { ProviderCardExtrasOwnerProps } from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type { LanguageController } from './language.ts'
import { OpenCodeCredentialForm } from './OpenCodeCredentialForm.tsx'
import { routeFromProvider, type CredentialController, type RouteCredentialState } from './credential-controller.ts'

export function OpenCodeProviderCard(props: ProviderCardExtrasOwnerProps & { controller: CredentialController; language: LanguageController }): ReactNode {
  const route = routeFromProvider(props.provider.provider)
  const [state, setState] = useState<RouteCredentialState>(() => ({ kind: 'loading', route: route ?? 'zen' }))
  useEffect(() => {
    if (route === undefined) return
    let active = true
    const dispose = props.controller.subscribe(() => {
      const next = props.controller.state(route)
      if (active && next !== undefined) setState(next)
    })
    void props.controller.loadRoute(route).then(next => { if (active) setState(next) })
    return () => { active = false; dispose() }
  }, [props.controller, route])
  if (route === undefined) return null
  return <section data-dsh-opencode-provider={route}><OpenCodeCredentialForm route={route} state={state} controller={props.controller} language={props.language} /></section>
}
