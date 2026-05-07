import { LLM4AgentsClient } from '@llmforagents/sdk'
import type { ApiKey } from '@/domain/branded'

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000 // 5 min — heavy council prompts can take a while

export type SdkConfig = Readonly<{
  baseUrl?: string
  timeout?: number
}>

export function createSdkClient(apiKey: ApiKey, config?: SdkConfig): LLM4AgentsClient {
  return new LLM4AgentsClient({
    apiKey: apiKey as unknown as string,
    ...(config?.baseUrl !== undefined ? { baseUrl: config.baseUrl } : {}),
    timeout: config?.timeout ?? DEFAULT_TIMEOUT_MS,
  })
}
