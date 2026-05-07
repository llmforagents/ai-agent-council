import type { AgentId, ApiKey } from './branded'

export type Agent = Readonly<{
  id: AgentId
  name: string
  apiKey: ApiKey
  createdAt: Date
}>
