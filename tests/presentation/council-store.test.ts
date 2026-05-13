import { describe, it, expect } from 'vitest'
import type { CouncilSnapshot } from '@/presentation/hooks/useCouncilStore'

describe('council snapshot — tool events persistence', () => {
  it('preserves draft_tool_call and draft_tool_result events through a JSON roundtrip', () => {
    const snap: CouncilSnapshot = {
      id: 'r1',
      timestamp: new Date().toISOString(),
      plan: 'pro',
      userTask: 't',
      events: [
        {
          kind: 'council_started',
          totalDrafters: 3,
          chairman: 'some/model' as never,
          debateRounds: 2,
        },
        {
          kind: 'draft_tool_call',
          slot: 'A',
          callId: 'call_1',
          toolName: 'google_search',
          args: { q: 'foo' },
        },
        {
          kind: 'draft_tool_result',
          slot: 'A',
          callId: 'call_1',
          ok: true,
          summary: '3 results',
        },
      ],
      finalAnswer: null,
      totalCostCents: 0,
      error: null,
    }

    const json = JSON.parse(JSON.stringify(snap)) as CouncilSnapshot
    expect(json.events).toHaveLength(3)

    const toolCall = json.events[1] as Extract<typeof json.events[number], { kind: 'draft_tool_call' }>
    expect(toolCall.callId).toBe('call_1')
    expect(toolCall.toolName).toBe('google_search')
    expect(toolCall.args).toEqual({ q: 'foo' })

    const toolResult = json.events[2] as Extract<typeof json.events[number], { kind: 'draft_tool_result' }>
    expect(toolResult.callId).toBe('call_1')
    expect(toolResult.ok).toBe(true)
    expect(toolResult.summary).toBe('3 results')
  })

  it('preserves debate_tool_call and debate_tool_result events through a JSON roundtrip', () => {
    const snap: CouncilSnapshot = {
      id: 'r2',
      timestamp: new Date().toISOString(),
      plan: 'power',
      userTask: 't',
      events: [
        {
          kind: 'debate_tool_call',
          round: 2,
          slot: 'B',
          callId: 'call_3',
          toolName: 'fetch_html',
          args: { url: 'https://example.com' },
        },
        {
          kind: 'debate_tool_result',
          round: 2,
          slot: 'B',
          callId: 'call_3',
          ok: true,
          summary: '<html>…</html>',
        },
      ],
      finalAnswer: null,
      totalCostCents: 0,
      error: null,
    }

    const json = JSON.parse(JSON.stringify(snap)) as CouncilSnapshot
    expect(json.events).toHaveLength(2)
    const call = json.events[0] as Extract<typeof json.events[number], { kind: 'debate_tool_call' }>
    expect(call.round).toBe(2)
    expect(call.toolName).toBe('fetch_html')
    const result = json.events[1] as Extract<typeof json.events[number], { kind: 'debate_tool_result' }>
    expect(result.round).toBe(2)
    expect(result.callId).toBe('call_3')
  })
})
