import { Err, Ok, type Result } from '@/domain/result'
import type { RestError } from '@/domain/errors'
import type { ApiKey } from '@/domain/branded'
import type {
  RestApiPort,
  RegisterAgentRequest,
  RegisterAgentResponse,
  BalanceResponse,
  ModelsResponse,
  ChatCompletionRequest,
  ChatStreamChunk,
  GenerateWalletRequest,
  GenerateWalletResponse,
  ChatResponseMeta,
} from '@/application/ports'
import { createSdkClient } from './sdkClient'

const DEFAULT_FETCH_TIMEOUT_MS = 60_000

export class RestApiClient implements RestApiPort {
  constructor(private readonly apiBase: string) {}

  async registerAgent(req: RegisterAgentRequest): Promise<Result<RegisterAgentResponse, RestError>> {
    return this.postJson<RegisterAgentResponse>('/api/v1/agents/register', req)
  }

  async getBalance(key: ApiKey): Promise<Result<BalanceResponse, RestError>> {
    const sdk = createSdkClient(key, { baseUrl: this.apiBase })
    try {
      const r = await sdk.wallets.balance()
      return Ok({
        availableUsdCents: r.availableUsdCents,
        totalDepositedUsd: typeof r.totalDepositedUsd === 'number' ? r.totalDepositedUsd : Number(r.totalDepositedUsd ?? 0),
        totalSpentUsd: typeof r.totalSpentUsd === 'number' ? r.totalSpentUsd : Number(r.totalSpentUsd ?? 0),
      })
    } catch (e) {
      return Err(translateError(e))
    }
  }

  async listModels(key: ApiKey, search?: string): Promise<Result<ModelsResponse, RestError>> {
    const sdk = createSdkClient(key, { baseUrl: this.apiBase })
    try {
      const r = (await sdk.models.list(search ? { search } : undefined)) as unknown
      const wrapper = r as { models?: ReadonlyArray<Record<string, unknown>> }
      const list = (wrapper.models ?? (r as ReadonlyArray<Record<string, unknown>>)) as ReadonlyArray<Record<string, unknown>>
      const models = list.map((m) => {
        const provider = m['provider']
        const ctx = m['contextWindow']
        return {
          slug: String(m['slug'] ?? ''),
          displayName: String(m['displayName'] ?? m['slug'] ?? ''),
          inputPricePer1M: Number(m['inputPricePer1M'] ?? 0),
          outputPricePer1M: Number(m['outputPricePer1M'] ?? 0),
          ...(provider !== undefined ? { provider: String(provider) } : {}),
          ...(ctx !== undefined ? { contextWindow: Number(ctx) } : {}),
        }
      })
      return Ok({ models })
    } catch (e) {
      return Err(translateError(e))
    }
  }

  async generateWallet(key: ApiKey, req: GenerateWalletRequest): Promise<Result<GenerateWalletResponse, RestError>> {
    const sdk = createSdkClient(key, { baseUrl: this.apiBase })
    try {
      const r = await sdk.wallets.generate(req)
      return Ok({
        chain: r.chain as 'solana' | 'polygon',
        token: r.token as 'USDT' | 'USDC',
        address: r.address,
        createdAt: r.createdAt,
      })
    } catch (e) {
      return Err(translateError(e))
    }
  }

  async *chatCompletionStream(
    key: ApiKey, req: ChatCompletionRequest, signal: AbortSignal, timeoutMs?: number,
  ): AsyncGenerator<ChatStreamChunk, void, void> {
    const sdk = createSdkClient(
      key,
      timeoutMs !== undefined
        ? { baseUrl: this.apiBase, timeout: timeoutMs }
        : { baseUrl: this.apiBase },
    )
    type SseUsage = { prompt_tokens?: number; completion_tokens?: number; cost?: number }
    let capturedMeta: { costUsdCents?: number; tokensInput?: number; tokensOutput?: number; balanceRemainingCents?: number; requestId?: string } | undefined
    let stream: AsyncIterable<unknown>
    try {
      const result = await sdk.chat.completions.create(
        {
          model: req.model,
          messages: [...req.messages],
          stream: true,
        },
        {
          signal,
          onMeta: (m) => { capturedMeta = m as typeof capturedMeta },
        },
      )
      stream = result as AsyncIterable<unknown>
    } catch {
      return
    }
    let full = ''
    let lastUsage: SseUsage | undefined
    for await (const raw of stream) {
      const chunk = raw as { choices?: ReadonlyArray<{ delta?: { content?: string } }>; usage?: SseUsage }
      if (chunk.usage) lastUsage = chunk.usage
      const contentDelta = chunk.choices?.[0]?.delta?.content ?? ''
      if (contentDelta) {
        full += contentDelta
        yield { kind: 'delta', text: contentDelta }
      }
    }
    yield {
      kind: 'done',
      fullText: full,
      meta: buildMeta(capturedMeta, lastUsage),
    }
  }

  private async postJson<T>(path: string, body: unknown): Promise<Result<T, RestError>> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), DEFAULT_FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(`${this.apiBase}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      if (!res.ok) {
        const text = await res.text()
        let parsed: unknown = text
        try { parsed = JSON.parse(text) } catch { /* keep text */ }
        if (res.status === 401) return Err({ kind: 'unauthorized' })
        if (res.status === 429) return Err({ kind: 'rate_limited', retryAfterMs: 1000 })
        return Err({ kind: 'upstream_error', status: res.status, body: parsed })
      }
      return Ok((await res.json()) as T)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        return Err({ kind: 'timeout', endpoint: path })
      }
      return Err({ kind: 'network' })
    } finally {
      clearTimeout(timer)
    }
  }
}

function translateError(e: unknown): RestError {
  const code = (e as { code?: string } | null)?.code
  const msg = (e as { message?: string } | null)?.message ?? String(e)
  if (code === 'auth_error') return { kind: 'unauthorized' }
  if (code === 'insufficient_balance') return { kind: 'insufficient_balance' }
  if (code === 'rate_limited') return { kind: 'rate_limited', retryAfterMs: 1000 }
  if (code === 'timeout') return { kind: 'timeout', endpoint: 'sdk' }
  if (code === 'network_error') return { kind: 'network' }
  return { kind: 'unknown', message: msg, raw: e }
}

function buildMeta(
  m: { costUsdCents?: number; tokensInput?: number; tokensOutput?: number; balanceRemainingCents?: number; requestId?: string } | undefined,
  usage: { prompt_tokens?: number; completion_tokens?: number; cost?: number } | undefined,
): ChatResponseMeta {
  const out: { costCents?: number; tokensInput?: number; tokensOutput?: number; balanceRemainingCents?: number; requestId?: string } = {}
  const costCents = m?.costUsdCents ?? (usage?.cost !== undefined ? usage.cost * 100 : undefined)
  if (costCents !== undefined) out.costCents = costCents
  const tokensInput = m?.tokensInput ?? usage?.prompt_tokens
  if (tokensInput !== undefined) out.tokensInput = tokensInput
  const tokensOutput = m?.tokensOutput ?? usage?.completion_tokens
  if (tokensOutput !== undefined) out.tokensOutput = tokensOutput
  if (m?.balanceRemainingCents !== undefined) out.balanceRemainingCents = m.balanceRemainingCents
  if (m?.requestId !== undefined) out.requestId = m.requestId
  return out
}
