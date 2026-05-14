import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LLM4AgentsError } from '@llmforagents/sdk'
import type { Model, ApiKey } from '@/domain/branded'
import { runDrafterTurnWithTools } from '@/application/runCouncilTurn'

// We replace createSdkClient with a hand-rolled mock whose chat.conversation
// returns a stream of pre-canned events and exposes the onToolCall callback
// for inspection by the test.

let mockStream: AsyncIterable<unknown> = (async function* () {})()
let onToolCallCaptured:
  | ((name: string, args: Readonly<Record<string, unknown>>) => boolean | Promise<boolean>)
  | undefined
let onRoundMetaCaptured: ((meta: { costUsdCents?: number }) => void) | undefined

vi.mock('@/infrastructure/sdkClient', () => ({
  createSdkClient: () => ({
    tools: {},
    chat: {
      conversation: (opts: {
        onToolCall?: typeof onToolCallCaptured
        onRoundMeta?: typeof onRoundMetaCaptured
      }) => {
        onToolCallCaptured = opts.onToolCall
        onRoundMetaCaptured = opts.onRoundMeta
        return {
          stream: () => mockStream,
        }
      },
    },
  }),
}))

const baseDeps = { key: 'k_test' as unknown as ApiKey }
const baseParams = {
  model: 'gpt-x' as unknown as Model,
  systemPrompt: 'sys',
  history: [],
  userMessage: 'hello',
  allowedTools: ['google_search'] as const,
  maxToolCalls: 3,
}

beforeEach(() => {
  onToolCallCaptured = undefined
  onRoundMetaCaptured = undefined
  mockStream = (async function* () {})()
})

describe('runDrafterTurnWithTools', () => {
  it('yields delta → tool_call → tool_result → delta and returns final content', async () => {
    mockStream = (async function* () {
      yield { type: 'text', content: 'hi ' }
      yield { type: 'tool_start', name: 'google_search', args: { q: 'foo' } }
      yield {
        type: 'tool_end',
        name: 'google_search',
        result: { content: [{ type: 'text', text: '3 results' }], text: '3 results' },
        durationMs: 100,
      }
      yield { type: 'text', content: 'there' }
      yield { type: 'done', response: { content: 'hi there' } }
    })()

    const events: unknown[] = []
    const gen = runDrafterTurnWithTools(baseDeps, baseParams)
    let finalResult: { content: string; costCents: number } | undefined
    for (;;) {
      const r = await gen.next()
      if (r.done) {
        finalResult = r.value
        break
      }
      events.push(r.value)
    }

    expect(events.map((e) => (e as { kind: string }).kind)).toEqual([
      'delta',
      'tool_call',
      'tool_result',
      'delta',
    ])
    expect(finalResult?.content).toBe('hi there')
  })

  it('onToolCall rejects tools outside the allowed whitelist', async () => {
    mockStream = (async function* () {
      yield { type: 'done', response: { content: '' } }
    })()
    const gen = runDrafterTurnWithTools(baseDeps, baseParams)
    for await (const _ev of gen) {
      /* drain */ void _ev
    }

    expect(onToolCallCaptured).toBeDefined()
    if (!onToolCallCaptured) throw new Error('onToolCall not captured')
    expect(await onToolCallCaptured('generate_image', {})).toBe(false)
    expect(await onToolCallCaptured('google_search', {})).toBe(true)
  })

  it('onToolCall rejects after maxToolCalls is reached', async () => {
    mockStream = (async function* () {
      yield { type: 'done', response: { content: '' } }
    })()
    const gen = runDrafterTurnWithTools(baseDeps, { ...baseParams, maxToolCalls: 2 })
    for await (const _ev of gen) {
      /* drain */ void _ev
    }

    if (!onToolCallCaptured) throw new Error('onToolCall not captured')
    expect(await onToolCallCaptured('google_search', {})).toBe(true)
    expect(await onToolCallCaptured('google_search', {})).toBe(true)
    expect(await onToolCallCaptured('google_search', {})).toBe(false)
  })

  it('summarizes tool_end result with truncation at 120 chars', async () => {
    const longText = 'a'.repeat(200)
    mockStream = (async function* () {
      yield { type: 'tool_start', name: 'google_search', args: { q: 'foo' } }
      yield {
        type: 'tool_end',
        name: 'google_search',
        result: { content: [{ type: 'text', text: longText }], text: longText },
        durationMs: 1,
      }
      yield { type: 'done', response: { content: '' } }
    })()
    const events: unknown[] = []
    for await (const ev of runDrafterTurnWithTools(baseDeps, baseParams)) events.push(ev)
    const result = events.find((e) => (e as { kind: string }).kind === 'tool_result') as {
      ok: boolean
      summary: string
    }
    expect(result.ok).toBe(true)
    expect(result.summary.length).toBeLessThanOrEqual(121) // 120 + ellipsis char
    expect(result.summary.endsWith('…')).toBe(true)
  })

  it('correlates tool_call and tool_result via the same callId', async () => {
    mockStream = (async function* () {
      yield { type: 'tool_start', name: 'google_search', args: {} }
      yield {
        type: 'tool_end',
        name: 'google_search',
        result: { content: [{ type: 'text', text: 'r' }], text: 'r' },
        durationMs: 1,
      }
      yield { type: 'done', response: { content: '' } }
    })()
    const events: { kind: string; callId?: string }[] = []
    for await (const ev of runDrafterTurnWithTools(baseDeps, baseParams)) {
      events.push(ev as { kind: string; callId?: string })
    }
    const callEv = events.find((e) => e.kind === 'tool_call')
    const resultEv = events.find((e) => e.kind === 'tool_result')
    expect(callEv?.callId).toBeDefined()
    expect(callEv?.callId).toBe(resultEv?.callId)
  })

  it('returns gracefully when SDK throws tool_loop_limit (non-fatal)', async () => {
    mockStream = (async function* () {
      yield { type: 'text', content: 'partial' }
      throw new LLM4AgentsError('tool loop limit reached', 'tool_loop_limit', undefined, undefined)
    })()
    const events: unknown[] = []
    const gen = runDrafterTurnWithTools(baseDeps, baseParams)
    let final: { content: string; costCents: number } | undefined
    for (;;) {
      const r = await gen.next()
      if (r.done) {
        final = r.value
        break
      }
      events.push(r.value)
    }
    expect(final?.content).toBe('partial')
  })

  it('propagates other LLM4AgentsError codes as AppError', async () => {
    mockStream = (async function* () {
      throw new LLM4AgentsError('rate limited', 'rate_limited', 429, undefined)
    })()
    await expect(async () => {
      for await (const _ev of runDrafterTurnWithTools(baseDeps, baseParams)) void _ev
    }).rejects.toMatchObject({ kind: 'rate_limited' })
  })

  it('maps tool_execution_error to AppError kind tool_subsystem', async () => {
    mockStream = (async function* () {
      yield { type: 'tool_start', name: 'google_search', args: { q: 'x' } }
      throw new LLM4AgentsError('Search failed: upstream_error', 'tool_execution_error', 502, undefined)
    })()
    const events: unknown[] = []
    let thrown: unknown = null
    try {
      for await (const ev of runDrafterTurnWithTools(baseDeps, baseParams)) events.push(ev)
    } catch (e) {
      thrown = e
    }
    expect((thrown as { kind: string }).kind).toBe('tool_subsystem')
    // The pending tool_call must have been drained as a tool_result ok=false
    const result = events.find((e) => (e as { kind: string }).kind === 'tool_result') as { ok: boolean; summary: string }
    expect(result).toBeDefined()
    expect(result.ok).toBe(false)
    expect(result.summary).toContain('Search failed')
  })
})
