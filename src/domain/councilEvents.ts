import type { AppError } from './errors'
import type { Model } from './branded'
import type { DrafterSlot } from './council'
import type { CouncilToolName } from './council'

/**
 * Event flow per run (success):
 *   council_started
 *   - draft_started ×N (parallel)
 *   - draft_delta × many (per slot, streamed)
 *   - draft_tool_call / draft_tool_result × maxCallsPerDrafter (when tools enabled)
 *   - draft_done ×N
 *   - debate_round_started (round=1, round=2, …)
 *     - debate_started ×N
 *     - debate_delta × many
 *     - debate_tool_call / debate_tool_result × maxCallsPerDrafter
 *     - debate_done ×N
 *   - synthesis_started
 *   - synthesis_delta × many
 *   - synthesis_done
 *   - council_done
 *
 * Each *_tool_call has a matching *_tool_result correlated by `callId`.
 * round numbers are 1-indexed for user-facing display.
 */
export type CouncilEvent =
  | Readonly<{
      kind: 'council_started'
      totalDrafters: number
      chairman: Model
      debateRounds: number
    }>

  // --- drafts ---
  | Readonly<{ kind: 'draft_started'; slot: DrafterSlot; model: Model }>
  | Readonly<{ kind: 'draft_delta'; slot: DrafterSlot; text: string }>
  | Readonly<{
      kind: 'draft_done'
      slot: DrafterSlot
      model: Model
      content: string
      costCents: number
      durationMs: number
    }>
  | Readonly<{
      kind: 'draft_failed'
      slot: DrafterSlot
      model: Model
      error: AppError
    }>
  | Readonly<{
      kind: 'draft_tool_call'
      slot: DrafterSlot
      callId: string
      toolName: CouncilToolName
      args: unknown
    }>
  | Readonly<{
      kind: 'draft_tool_result'
      slot: DrafterSlot
      callId: string
      ok: boolean
      summary: string
    }>

  // --- debate (multi-round) ---
  | Readonly<{ kind: 'debate_round_started'; round: number; totalRounds: number }>
  | Readonly<{ kind: 'debate_started'; round: number; slot: DrafterSlot; model: Model }>
  | Readonly<{ kind: 'debate_delta'; round: number; slot: DrafterSlot; text: string }>
  | Readonly<{
      kind: 'debate_done'
      round: number
      slot: DrafterSlot
      model: Model
      content: string
      costCents: number
      durationMs: number
    }>
  | Readonly<{
      kind: 'debate_failed'
      round: number
      slot: DrafterSlot
      model: Model
      error: AppError
    }>
  | Readonly<{
      kind: 'debate_tool_call'
      round: number
      slot: DrafterSlot
      callId: string
      toolName: CouncilToolName
      args: unknown
    }>
  | Readonly<{
      kind: 'debate_tool_result'
      round: number
      slot: DrafterSlot
      callId: string
      ok: boolean
      summary: string
    }>

  // --- synthesis ---
  | Readonly<{ kind: 'synthesis_started'; model: Model }>
  | Readonly<{ kind: 'synthesis_delta'; text: string }>
  | Readonly<{
      kind: 'synthesis_done'
      model: Model
      content: string
      reasoning: string | null
      costCents: number
      durationMs: number
    }>

  // --- terminal ---
  | Readonly<{
      kind: 'council_done'
      finalAnswer: string
      totalCostCents: number
      totalDurationMs: number
    }>
  | Readonly<{ kind: 'council_failed'; error: AppError; partialCostCents: number }>
