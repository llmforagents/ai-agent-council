type Brand<T, B extends string> = T & { readonly __brand: B }

export type ApiKey = Brand<string, 'ApiKey'>
export function ApiKey(raw: string): ApiKey {
  if (!raw) throw new Error('Invalid ApiKey: empty')
  return raw as ApiKey
}

export type AgentId = Brand<string, 'AgentId'>
export function AgentId(raw: string): AgentId {
  if (!/^[0-9a-f-]{36}$/i.test(raw)) throw new Error(`Invalid AgentId: ${raw}`)
  return raw as AgentId
}

export type UsdCents = Brand<number, 'UsdCents'>
export function UsdCents(raw: number): UsdCents {
  if (!Number.isInteger(raw) || raw < 0) throw new Error(`Invalid UsdCents: ${raw}`)
  return raw as UsdCents
}

export type Model = Brand<string, 'Model'>
export function Model(raw: string): Model {
  if (!raw) throw new Error('Invalid Model: empty')
  return raw as Model
}
