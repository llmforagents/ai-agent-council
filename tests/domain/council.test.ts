import { describe, it, expect } from 'vitest'
import {
  COUNCIL_EXPENSIVE_THRESHOLD_CENTS,
  COUNCIL_PLANS,
  COUNCIL_PLAN_ORDER,
  DEFAULT_COUNCIL_CONFIG,
  DEFAULT_COUNCIL_PLAN,
  DRAFTER_SLOTS,
  MAX_DEBATE_ROUNDS,
  MAX_DRAFTERS,
  MIN_DEBATE_ROUNDS,
  MIN_DRAFTERS,
  PLAN_DEFAULT_ROUNDS,
  estimateCouncilCostCents,
  type CouncilConfig,
} from '@/domain/council'
import { Model } from '@/domain/branded'

describe('domain/council', () => {
  it('DEFAULT_COUNCIL_CONFIG has 3 drafters, a chairman, and the lite default rounds', () => {
    expect(DEFAULT_COUNCIL_CONFIG.drafters).toHaveLength(3)
    expect(DEFAULT_COUNCIL_CONFIG.chairman).toBeDefined()
    expect(DEFAULT_COUNCIL_CONFIG.debateRounds).toBe(PLAN_DEFAULT_ROUNDS.lite)
  })

  it('DRAFTER_SLOTS are A/B/C', () => {
    expect(DRAFTER_SLOTS).toEqual(['A', 'B', 'C'])
  })

  it('MIN/MAX drafters and debate rounds are fixed', () => {
    expect(MIN_DRAFTERS).toBe(2)
    expect(MAX_DRAFTERS).toBe(3)
    expect(MIN_DEBATE_ROUNDS).toBe(2)
    expect(MAX_DEBATE_ROUNDS).toBe(5)
  })

  it('plans have ascending default debate rounds', () => {
    expect(PLAN_DEFAULT_ROUNDS.lite).toBeLessThanOrEqual(PLAN_DEFAULT_ROUNDS.pro)
    expect(PLAN_DEFAULT_ROUNDS.pro).toBeLessThanOrEqual(PLAN_DEFAULT_ROUNDS.power)
    expect(PLAN_DEFAULT_ROUNDS.power).toBeLessThanOrEqual(MAX_DEBATE_ROUNDS)
  })

  it('estimateCouncilCostCents stays under expensive threshold for lite default', () => {
    const cents = estimateCouncilCostCents(COUNCIL_PLANS.lite)
    expect(cents).toBeLessThan(COUNCIL_EXPENSIVE_THRESHOLD_CENTS)
  })

  it('Power plan trips the expensive threshold', () => {
    expect(estimateCouncilCostCents(COUNCIL_PLANS.power)).toBeGreaterThanOrEqual(
      COUNCIL_EXPENSIVE_THRESHOLD_CENTS,
    )
  })

  it('cost grows with debate rounds', () => {
    const lo: CouncilConfig = { ...COUNCIL_PLANS.pro, debateRounds: 2 }
    const hi: CouncilConfig = { ...COUNCIL_PLANS.pro, debateRounds: 5 }
    expect(estimateCouncilCostCents(hi)).toBeGreaterThan(estimateCouncilCostCents(lo))
  })

  it('COUNCIL_PLANS exposes lite/pro/power; DEFAULT is lite', () => {
    expect(COUNCIL_PLAN_ORDER).toEqual(['lite', 'pro', 'power'])
    expect(DEFAULT_COUNCIL_PLAN).toBe('lite')
    expect(COUNCIL_PLANS.lite).toEqual(DEFAULT_COUNCIL_CONFIG)
    expect(COUNCIL_PLANS.power.drafters).toHaveLength(3)
    expect(String(COUNCIL_PLANS.power.chairman)).toContain('opus')
  })

  it('isPremium heuristic matches new model families', () => {
    const gpt5Lite: CouncilConfig = { ...COUNCIL_PLANS.lite, chairman: Model('openai/gpt-5') }
    const gpt5Premium: CouncilConfig = { ...COUNCIL_PLANS.lite, chairman: Model('openai/gpt-5.2') }
    expect(estimateCouncilCostCents(gpt5Lite)).toBeLessThan(estimateCouncilCostCents(gpt5Premium))

    const flashChair: CouncilConfig = { ...COUNCIL_PLANS.lite, chairman: Model('google/gemini-2.5-flash') }
    const proChair: CouncilConfig = { ...COUNCIL_PLANS.lite, chairman: Model('google/gemini-2.5-pro') }
    expect(estimateCouncilCostCents(flashChair)).toBeLessThan(estimateCouncilCostCents(proChair))
  })

  it('tools cost is zero when no stages are enabled', () => {
    const base = COUNCIL_PLANS.lite
    expect(estimateCouncilCostCents(base)).toBeGreaterThan(0)
    const withoutTools = { ...base, tools: { stages: [], maxCallsPerDrafter: 0 } }
    expect(estimateCouncilCostCents(withoutTools)).toBe(estimateCouncilCostCents(base))
  })

  it('tools cost scales with stages and maxCallsPerDrafter', () => {
    const draftsOnly = {
      ...COUNCIL_PLANS.lite,
      tools: { stages: ['drafts'] as const, maxCallsPerDrafter: 3 },
    }
    const draftsAndDebate = {
      ...COUNCIL_PLANS.lite,
      tools: { stages: ['drafts', 'debate'] as const, maxCallsPerDrafter: 3 },
    }
    const liteRounds = COUNCIL_PLANS.lite.debateRounds
    const drafters = COUNCIL_PLANS.lite.drafters.length

    const expectedDraftsOnly = Math.round(drafters * 3 * 1 * 0.12)
    const expectedBoth = Math.round(drafters * 3 * (1 + liteRounds) * 0.12)

    expect(estimateCouncilCostCents(draftsAndDebate) - estimateCouncilCostCents(draftsOnly))
      .toBe(expectedBoth - expectedDraftsOnly)
  })

  it('power preset full-tools run adds at most ~5¢ over a tools-disabled version', () => {
    const withTools = COUNCIL_PLANS.power
    const withoutTools = { ...withTools, tools: { stages: [], maxCallsPerDrafter: 0 } }
    const delta = estimateCouncilCostCents(withTools) - estimateCouncilCostCents(withoutTools)
    expect(delta).toBeGreaterThan(0)
    expect(delta).toBeLessThanOrEqual(8)
  })
})
