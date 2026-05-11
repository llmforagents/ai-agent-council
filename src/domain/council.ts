import { Model } from './branded'

export type DrafterSlot = 'A' | 'B' | 'C'

export const DRAFTER_SLOTS: ReadonlyArray<DrafterSlot> = ['A', 'B', 'C'] as const

export type CouncilConfig = Readonly<{
  drafters: ReadonlyArray<Model>
  chairman: Model
  debateRounds: number
}>

export const MAX_DRAFTERS = 3 as const
export const MIN_DRAFTERS = 2 as const

export const MIN_DEBATE_ROUNDS = 2 as const
export const MAX_DEBATE_ROUNDS = 5 as const

export type CouncilPlan = 'lite' | 'pro' | 'power'

export const COUNCIL_PLAN_ORDER: ReadonlyArray<CouncilPlan> = ['lite', 'pro', 'power'] as const

/**
 * Default debate rounds per plan.
 * - Lite: 2 (cheap, quick).
 * - Pro: 3 (balanced).
 * - Power: 4 (deeper deliberation; cap is 5).
 */
export const PLAN_DEFAULT_ROUNDS: Readonly<Record<CouncilPlan, number>> = {
  lite: 2,
  pro: 3,
  power: 4,
}

/**
 * Preset model configurations. Round counts come from PLAN_DEFAULT_ROUNDS.
 *
 * Lite (~$0.02/run @ 2 rounds):  fast, cheap, broad family diversity.
 * Pro (~$0.45/run @ 3 rounds):   stronger drafters + Sonnet 4.6 chairman.
 * Power (~$2.20/run @ 4 rounds): top-of-line frontier; trips expensive guard.
 */
export const COUNCIL_PLANS: Readonly<Record<CouncilPlan, CouncilConfig>> = {
  lite: {
    drafters: [
      Model('google/gemini-2.5-flash-lite'),
      Model('anthropic/claude-haiku-4.5'),
      Model('openai/gpt-5-mini'),
    ],
    chairman: Model('google/gemini-2.5-flash-lite'),
    debateRounds: PLAN_DEFAULT_ROUNDS.lite,
  },
  pro: {
    drafters: [
      Model('deepseek/deepseek-v4-pro'),
      Model('z-ai/glm-5.1'),
      Model('moonshotai/kimi-k2.6'),
    ],
    chairman: Model('anthropic/claude-sonnet-4.6'),
    debateRounds: PLAN_DEFAULT_ROUNDS.pro,
  },
  power: {
    drafters: [
      Model('anthropic/claude-opus-4.7'),
      Model('openai/gpt-5.2'),
      Model('google/gemini-2.5-pro'),
    ],
    chairman: Model('anthropic/claude-opus-4.7'),
    debateRounds: PLAN_DEFAULT_ROUNDS.power,
  },
}

export const DEFAULT_COUNCIL_PLAN: CouncilPlan = 'lite'

export const DEFAULT_COUNCIL_CONFIG: CouncilConfig = COUNCIL_PLANS[DEFAULT_COUNCIL_PLAN]

export const COUNCIL_EXPENSIVE_THRESHOLD_CENTS = 50 as const

/**
 * Rough cost estimate. Drafts are 1 round; debates are N-1 rounds where N=debateRounds.
 * Each drafter calls once per debate round + once for the initial draft.
 * Chairman calls once for synthesis.
 */
export function estimateCouncilCostCents(config: CouncilConfig): number {
  const isPremium = (m: Model): boolean => {
    const s = String(m).toLowerCase()
    return (
      s.includes('opus') ||
      s.includes('sonnet') ||
      /gpt-5\.\d/.test(s) ||
      /gemini.*-pro/.test(s) ||
      /o3(-pro)?$/.test(s)
    )
  }
  const drafterUnit = (m: Model): number => (isPremium(m) ? 8 : 1)
  const drafterTotal = config.drafters.reduce((sum, m) => sum + drafterUnit(m), 0)
  // 1 draft + (debateRounds - 1) debate rounds, all using drafter models
  const callsPerDrafterStage = Math.max(1, config.debateRounds)
  const draftAndDebateCost = drafterTotal * callsPerDrafterStage
  const synthesisCost = isPremium(config.chairman) ? 15 : 2
  return draftAndDebateCost + synthesisCost
}
