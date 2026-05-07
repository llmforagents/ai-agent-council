import type { Result } from '@/domain/result'
import type { RestError } from '@/domain/errors'
import type { ApiKey } from '@/domain/branded'

export type ChatStreamChunk =
  | { readonly kind: 'delta'; readonly text: string }
  | { readonly kind: 'done'; readonly fullText: string; readonly meta: ChatResponseMeta }

export type ChatResponseMeta = Readonly<{
  costCents?: number
  tokensInput?: number
  tokensOutput?: number
  balanceRemainingCents?: number
  requestId?: string
}>

export type ChatMessage = Readonly<{
  role: 'system' | 'user' | 'assistant'
  content: string
}>

export type ChatCompletionRequest = Readonly<{
  model: string
  messages: ReadonlyArray<ChatMessage>
  stream?: boolean
}>

export type RegisterAgentRequest = Readonly<{ name: string }>
export type RegisterAgentResponse = Readonly<{
  uuid: string
  apiKey: string
  name: string
  createdAt: string
}>

export type BalanceResponse = Readonly<{
  availableUsdCents: number
  totalDepositedUsd: number
  totalSpentUsd: number
}>

export type ModelInfo = Readonly<{
  slug: string
  displayName: string
  provider?: string
  inputPricePer1M: number
  outputPricePer1M: number
  contextWindow?: number
}>

export type ModelsResponse = Readonly<{ models: ReadonlyArray<ModelInfo> }>

export type GenerateWalletRequest = Readonly<{
  chain: 'solana' | 'polygon'
  token: 'USDT' | 'USDC'
}>

export type GenerateWalletResponse = Readonly<{
  chain: 'solana' | 'polygon'
  token: 'USDT' | 'USDC'
  address: string
  createdAt: string
}>

export interface RestApiPort {
  registerAgent(req: RegisterAgentRequest): Promise<Result<RegisterAgentResponse, RestError>>
  getBalance(key: ApiKey): Promise<Result<BalanceResponse, RestError>>
  listModels(key: ApiKey, search?: string): Promise<Result<ModelsResponse, RestError>>
  generateWallet(key: ApiKey, req: GenerateWalletRequest): Promise<Result<GenerateWalletResponse, RestError>>
  chatCompletionStream(
    key: ApiKey, req: ChatCompletionRequest, signal: AbortSignal, timeoutMs?: number,
  ): AsyncGenerator<ChatStreamChunk, void, void>
}
