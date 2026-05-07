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
  uuid: string
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

export type TransactionType = 'deposit' | 'usage' | 'refund'

export type TransactionInfo = Readonly<{
  id: string
  type: TransactionType
  amountCents: number
  timestamp: string
  description?: string
  model?: string
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  chain?: string
  txHash?: string
}>

export type ListTransactionsRequest = Readonly<{
  type?: TransactionType
  limit?: number
  offset?: number
}>

export type TransactionsResponse = Readonly<{
  transactions: ReadonlyArray<TransactionInfo>
  total: number
  limit: number
  offset: number
  requestId?: string
}>

export interface RestApiPort {
  registerAgent(req: RegisterAgentRequest): Promise<Result<RegisterAgentResponse, RestError>>
  getBalance(key: ApiKey): Promise<Result<BalanceResponse, RestError>>
  listModels(key: ApiKey, search?: string): Promise<Result<ModelsResponse, RestError>>
  generateWallet(key: ApiKey, req: GenerateWalletRequest): Promise<Result<GenerateWalletResponse, RestError>>
  listTransactions(key: ApiKey, req: ListTransactionsRequest): Promise<Result<TransactionsResponse, RestError>>
  chatCompletionStream(
    key: ApiKey, req: ChatCompletionRequest, signal: AbortSignal, timeoutMs?: number,
  ): AsyncGenerator<ChatStreamChunk, void, void>
}
