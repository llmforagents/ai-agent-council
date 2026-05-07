import { RestApiClient } from '@/infrastructure/restClient'

export type AppEnv = Readonly<{ apiBase: string }>

export type AppContainer = Readonly<{
  rest: RestApiClient
  apiBase: string
}>

export function composeApp(env: AppEnv): AppContainer {
  // In dev the Vite proxy rewrites /proxy/api → env.apiBase.
  // In prod we hit env.apiBase directly.
  const isDev = import.meta.env.DEV
  const effectiveBase = isDev ? '/proxy/api' : env.apiBase
  return {
    rest: new RestApiClient(effectiveBase),
    apiBase: effectiveBase,
  }
}
