import { describe, it, expect } from 'vitest'
import {
  COUNCIL_TOOL_NAMES,
  MIN_TOOL_CALLS_PER_DRAFTER,
  MAX_TOOL_CALLS_PER_DRAFTER,
  COUNCIL_PLANS,
} from '@/domain/council'

describe('council tools constants', () => {
  it('exposes exactly the three research tools, in order', () => {
    expect([...COUNCIL_TOOL_NAMES]).toEqual([
      'google_search',
      'google_news',
      'fetch_html',
    ])
  })

  it('caps tool calls per drafter between 0 and 5', () => {
    expect(MIN_TOOL_CALLS_PER_DRAFTER).toBe(0)
    expect(MAX_TOOL_CALLS_PER_DRAFTER).toBe(5)
  })

  it('lite plan disables tools by default', () => {
    expect(COUNCIL_PLANS.lite.tools).toEqual({ stages: [], maxCallsPerDrafter: 0 })
  })

  it('pro plan enables tools in drafts only with cap 3', () => {
    expect(COUNCIL_PLANS.pro.tools.stages).toEqual(['drafts'])
    expect(COUNCIL_PLANS.pro.tools.maxCallsPerDrafter).toBe(3)
  })

  it('power plan enables tools in drafts and debate with cap 3', () => {
    expect([...COUNCIL_PLANS.power.tools.stages]).toEqual(['drafts', 'debate'])
    expect(COUNCIL_PLANS.power.tools.maxCallsPerDrafter).toBe(3)
  })
})
