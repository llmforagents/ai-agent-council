import { LLM4AgentsError } from '@llmforagents/sdk'
import type { ApiKey, Model } from '@/domain/branded'
import type { CouncilToolName } from '@/domain/council'
import { COUNCIL_TOOL_NAMES } from '@/domain/council'
import type { AppError } from '@/domain/errors'
import { coerceToAppError } from '@/domain/errors'
import type { SdkConfig } from '@/infrastructure/sdkClient'
import { createSdkClient } from '@/infrastructure/sdkClient'

export type DrafterTurnEvent =
  | Readonly<{ kind: 'delta'; text: string }>
  | Readonly<{ kind: 'tool_call'; callId: string; toolName: CouncilToolName; args: unknown }>
  | Readonly<{ kind: 'tool_result'; callId: string; ok: boolean; summary: string }>

export type RunDrafterTurnDeps = Readonly<{
  key: ApiKey
  sdkConfig?: SdkConfig
}>

export type RunDrafterTurnParams = Readonly<{
  model: Model
  systemPrompt: string
  history: ReadonlyArray<Readonly<{ role: 'system' | 'user' | 'assistant'; content: string }>>
  userMessage: string
  allowedTools: ReadonlyArray<CouncilToolName>
  maxToolCalls: number
  signal?: AbortSignal
}>

export type RunDrafterTurnResult = Readonly<{
  content: string
  costCents: number
}>

function isAllowedTool(
  name: string,
  allowed: ReadonlyArray<CouncilToolName>,
): name is CouncilToolName {
  return (
    (COUNCIL_TOOL_NAMES as ReadonlyArray<string>).includes(name) &&
    (allowed as ReadonlyArray<string>).includes(name)
  )
}

function summarizeToolResult(result: unknown): { ok: boolean; summary: string } {
  if (!result || typeof result !== 'object') return { ok: true, summary: '(no result)' }
  const r = result as { content?: ReadonlyArray<unknown>; text?: string }
  // The SDK's McpToolResult exposes `text` (joined text) for convenience. Use it
  // first when present.
  if (typeof r.text === 'string' && r.text.length > 0) {
    const t = r.text
    return { ok: true, summary: t.length > 120 ? `${t.slice(0, 120)}…` : t }
  }
  const first = r.content?.[0] as { type?: string; text?: string; mimeType?: string } | undefined
  if (!first) return { ok: true, summary: '(empty result)' }
  if (first.type === 'text' && typeof first.text === 'string') {
    const t = first.text
    return { ok: true, summary: t.length > 120 ? `${t.slice(0, 120)}…` : t }
  }
  if (first.type === 'image' && typeof first.mimeType === 'string') {
    return { ok: true, summary: `Image (${first.mimeType})` }
  }
  return { ok: true, summary: `${first.type ?? 'unknown'} result` }
}

function sdkErrorToAppError(e: LLM4AgentsError): AppError {
  switch (e.code) {
    case 'auth_error':
      return { kind: 'unauthorized' }
    case 'rate_limited':
      return { kind: 'rate_limited', retryAfterMs: 1000 }
    case 'network_error':
      return { kind: 'network' }
    case 'timeout':
      return { kind: 'timeout', endpoint: 'sdk-conversation' }
    case 'insufficient_balance':
      return { kind: 'insufficient_balance' }
    case 'tool_execution_error':
    case 'tool_not_found':
      return { kind: 'tool_subsystem', message: e.message }
    default:
      return { kind: 'unknown', message: e.message, raw: { code: e.code } }
  }
}

export async function* runDrafterTurnWithTools(
  deps: RunDrafterTurnDeps,
  params: RunDrafterTurnParams,
): AsyncGenerator<DrafterTurnEvent, RunDrafterTurnResult, void> {
  const sdk = createSdkClient(deps.key, deps.sdkConfig)

  let callsUsed = 0
  let costCents = 0
  let callCounter = 0
  const callIdStack: string[] = []

  const onToolCall = (name: string): boolean => {
    if (!isAllowedTool(name, params.allowedTools)) return false
    if (callsUsed >= params.maxToolCalls) return false
    callsUsed += 1
    return true
  }

  const conv = sdk.chat.conversation({
    model: String(params.model),
    system: params.systemPrompt,
    tools: sdk.tools,
    history: params.history.map((m) => ({ role: m.role, content: m.content })),
    onToolCall,
    onRoundMeta: (m) => {
      const c = (m as { costUsdCents?: number | undefined }).costUsdCents
      if (typeof c === 'number') costCents += c
    },
    enablePromptToolFallback: true,
    // Give the model 2 rounds of headroom after exhausting the tool budget so
    // it can actually produce a final text answer. SDK requires >= 1; we need
    // tool_rounds + text_rounds, so total = maxToolCalls + 2 (at least 2).
    maxToolRounds: Math.max(2, params.maxToolCalls + 2),
    ...(params.signal ? { signal: params.signal } : {}),
  })

  let finalContent = ''
  try {
    for await (const raw of conv.stream(params.userMessage)) {
      const ev = raw as
        | { type: 'text'; content: string }
        | { type: 'reasoning'; content: string }
        | { type: 'meta'; meta: { costUsdCents?: number } }
        | { type: 'tool_start'; name: string; args: Readonly<Record<string, unknown>> }
        | { type: 'tool_end'; name: string; result: unknown; durationMs: number }
        | { type: 'fallback'; reason: string; model: string }
        | { type: 'done'; response: { content: string } }
      switch (ev.type) {
        case 'text':
          yield { kind: 'delta', text: ev.content }
          finalContent += ev.content
          break
        case 'tool_start': {
          if (!isAllowedTool(ev.name, params.allowedTools)) break
          callCounter += 1
          const callId = `call_${callCounter}`
          callIdStack.push(callId)
          yield {
            kind: 'tool_call',
            callId,
            toolName: ev.name,
            args: ev.args,
          }
          break
        }
        case 'tool_end': {
          const callId = callIdStack.shift() ?? `call_${callCounter}`
          const { ok, summary } = summarizeToolResult(ev.result)
          yield { kind: 'tool_result', callId, ok, summary }
          break
        }
        case 'done':
          if (ev.response.content) finalContent = ev.response.content
          break
        // 'reasoning', 'meta', 'fallback' are intentionally ignored here.
      }
    }
  } catch (e) {
    if (e instanceof LLM4AgentsError) {
      if (e.code === 'tool_loop_limit') {
        // Non-fatal: the conversation simply exhausted its tool rounds.
        return { content: finalContent, costCents }
      }
      // Drain any in-flight tool_call ids with a synthetic failure result so
      // the UI doesn't leave them stuck in an "in-flight" state when the SDK
      // throws after emitting tool_start without a matching tool_end.
      while (callIdStack.length > 0) {
        const pending = callIdStack.shift()
        if (pending) {
          yield {
            kind: 'tool_result',
            callId: pending,
            ok: false,
            summary: `Tool error: ${e.message}`,
          }
        }
      }
      throw sdkErrorToAppError(e)
    }
    throw coerceToAppError(e)
  }
  return { content: finalContent, costCents }
}
