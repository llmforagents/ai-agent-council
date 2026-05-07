import { Err, Ok, type Result } from '@/domain/result'
import type { AppError } from '@/domain/errors'
import { coerceToAppError } from '@/domain/errors'
import type { Model, ApiKey } from '@/domain/branded'
import {
  type CouncilConfig,
  type DrafterSlot,
  DRAFTER_SLOTS,
  MAX_DEBATE_ROUNDS,
  MAX_DRAFTERS,
  MIN_DEBATE_ROUNDS,
  MIN_DRAFTERS,
} from '@/domain/council'
import type { CouncilEvent } from '@/domain/councilEvents'
import {
  buildDrafterMessages,
  buildDebateMessages,
  buildSynthesisMessages,
  anonymizeOthers,
  type ChatMessage,
} from './buildCouncilPrompts'
import type { RestApiPort } from './ports'

export type ChatPortArgs = Readonly<{
  model: Model
  messages: ReadonlyArray<ChatMessage>
  signal?: AbortSignal
}>

export type ChatPortChunk =
  | Readonly<{ kind: 'delta'; text: string }>
  | Readonly<{ kind: 'done'; content: string; costCents: number }>

export interface ChatPort {
  completionStream(args: ChatPortArgs): AsyncGenerator<ChatPortChunk, void, void>
}

const COUNCIL_STREAM_TIMEOUT_MS = 5 * 60 * 1000
const COUNCIL_STREAM_IDLE_MS = 60 * 1000

export function makeRestChatPort(rest: RestApiPort, key: ApiKey): ChatPort {
  return {
    async *completionStream({ model, messages, signal }) {
      const localController = new AbortController()
      const onUpstreamAbort = (): void => localController.abort('upstream')
      if (signal) {
        if (signal.aborted) localController.abort('upstream')
        else signal.addEventListener('abort', onUpstreamAbort)
      }

      let idleTimer: ReturnType<typeof setTimeout> | null = null
      const resetIdle = (): void => {
        if (idleTimer) clearTimeout(idleTimer)
        idleTimer = setTimeout(() => {
          localController.abort('idle')
        }, COUNCIL_STREAM_IDLE_MS)
      }
      resetIdle()

      try {
        const stream = rest.chatCompletionStream(
          key,
          {
            model: String(model),
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
            stream: true,
          },
          localController.signal,
          COUNCIL_STREAM_TIMEOUT_MS,
        )
        let buffered = ''
        let sawDone = false
        for await (const chunk of stream) {
          resetIdle()
          if (chunk.kind === 'delta') {
            buffered += chunk.text
            yield { kind: 'delta', text: chunk.text }
          } else if (chunk.kind === 'done') {
            sawDone = true
            yield {
              kind: 'done',
              content: chunk.fullText || buffered,
              costCents: chunk.meta.costCents ?? 0,
            }
          }
        }
        if (!sawDone && buffered.length > 0) {
          yield { kind: 'done', content: buffered, costCents: 0 }
        }
      } finally {
        if (idleTimer) clearTimeout(idleTimer)
        if (signal) signal.removeEventListener('abort', onUpstreamAbort)
      }
    },
  }
}

const MIN_LIVE_DRAFTS_TO_PROCEED = 2

type DraftResult = Readonly<{
  slot: DrafterSlot
  model: Model
  content: string
  costCents: number
}>

type DebateResult = Readonly<{
  slot: DrafterSlot
  model: Model
  content: string
  costCents: number
}>

export type RunCouncilArgs = Readonly<{
  config: CouncilConfig
  userTask: string
  signal?: AbortSignal
}>

export type RunCouncilDeps = Readonly<{
  chat: ChatPort
  getBalanceCents?: () => Promise<number | null>
}>

async function streamOne(
  chat: ChatPort,
  args: ChatPortArgs,
  onDelta: (text: string) => void,
): Promise<{ content: string; costCents: number }> {
  let content = ''
  let costCents = 0
  for await (const chunk of chat.completionStream(args)) {
    if (chunk.kind === 'delta') {
      onDelta(chunk.text)
      content += chunk.text
    } else if (chunk.kind === 'done') {
      content = chunk.content || content
      costCents = chunk.costCents
    }
  }
  return { content, costCents }
}

export async function* runCouncilChat(
  deps: RunCouncilDeps,
  args: RunCouncilArgs,
): AsyncGenerator<CouncilEvent, Result<{ finalAnswer: string }, AppError>, void> {
  const { chat, getBalanceCents } = deps
  const { config, userTask, signal } = args

  if (config.drafters.length < MIN_DRAFTERS || config.drafters.length > MAX_DRAFTERS) {
    const err: AppError = {
      kind: 'validation',
      issues: [
        {
          path: ['drafters'],
          message: `Council requires ${MIN_DRAFTERS}–${MAX_DRAFTERS} drafters, got ${config.drafters.length}`,
        },
      ],
    }
    yield { kind: 'council_failed', error: err, partialCostCents: 0 }
    return Err(err)
  }

  const debateRounds = Math.max(
    MIN_DEBATE_ROUNDS,
    Math.min(MAX_DEBATE_ROUNDS, config.debateRounds),
  )

  const startTime = Date.now()
  let totalCostCents = 0
  const balanceBefore: number | null = getBalanceCents
    ? await getBalanceCents().catch(() => null)
    : null

  yield {
    kind: 'council_started',
    totalDrafters: config.drafters.length,
    chairman: config.chairman,
    debateRounds,
  }

  const draftSlots: ReadonlyArray<{ slot: DrafterSlot; model: Model }> = config.drafters.map(
    (model, i) => ({ slot: (DRAFTER_SLOTS[i] ?? 'A') as DrafterSlot, model }),
  )

  for (const { slot, model } of draftSlots) {
    yield { kind: 'draft_started', slot, model }
  }

  type DeltaItem = Readonly<{ slot: DrafterSlot; text: string }>
  const draftDeltaQueue: DeltaItem[] = []
  let draftDoneCount = 0

  const draftPromises = draftSlots.map(async ({ slot, model }) => {
    const t0 = Date.now()
    try {
      const messages = buildDrafterMessages(userTask)
      const final = await streamOne(
        chat,
        signal !== undefined ? { model, messages, signal } : { model, messages },
        (text) => { draftDeltaQueue.push({ slot, text }) },
      )
      const durationMs = Date.now() - t0
      return { kind: 'ok' as const, slot, model, content: final.content, costCents: final.costCents, durationMs }
    } catch (e) {
      return { kind: 'failed' as const, slot, model, error: coerceToAppError(e) }
    } finally {
      draftDoneCount++
    }
  })

  while (draftDoneCount < draftSlots.length) {
    if (draftDeltaQueue.length === 0) {
      await new Promise((r) => setTimeout(r, 50))
      continue
    }
    while (draftDeltaQueue.length > 0) {
      const item = draftDeltaQueue.shift()
      if (item) yield { kind: 'draft_delta', slot: item.slot, text: item.text }
    }
  }
  while (draftDeltaQueue.length > 0) {
    const item = draftDeltaQueue.shift()
    if (item) yield { kind: 'draft_delta', slot: item.slot, text: item.text }
  }

  const draftSettlements = await Promise.all(draftPromises)
  const liveDrafts: DraftResult[] = []

  for (const settlement of draftSettlements) {
    if (settlement.kind === 'ok') {
      totalCostCents += settlement.costCents
      liveDrafts.push({
        slot: settlement.slot,
        model: settlement.model,
        content: settlement.content,
        costCents: settlement.costCents,
      })
      yield {
        kind: 'draft_done',
        slot: settlement.slot,
        model: settlement.model,
        content: settlement.content,
        costCents: settlement.costCents,
        durationMs: settlement.durationMs,
      }
    } else {
      yield { kind: 'draft_failed', slot: settlement.slot, model: settlement.model, error: settlement.error }
    }
  }

  if (liveDrafts.length < MIN_LIVE_DRAFTS_TO_PROCEED) {
    const err: AppError = {
      kind: 'validation',
      issues: [{ path: ['drafters'], message: `Only ${liveDrafts.length} drafter(s) succeeded, need ≥${MIN_LIVE_DRAFTS_TO_PROCEED}` }],
    }
    yield { kind: 'council_failed', error: err, partialCostCents: totalCostCents }
    return Err(err)
  }

  const allDebateRounds: DebateResult[][] = []
  const previousDebatePerSlot = new Map<DrafterSlot, string>()
  const getLatestPerSlot = (round: number): ReadonlyArray<{ slot: DrafterSlot; content: string }> => {
    if (round === 1 || allDebateRounds.length === 0) return liveDrafts.map(({ slot, content }) => ({ slot, content }))
    return allDebateRounds[allDebateRounds.length - 1] ?? []
  }

  for (let round = 1; round <= debateRounds; round++) {
    yield { kind: 'debate_round_started', round, totalRounds: debateRounds }
    for (const { slot, model } of liveDrafts) yield { kind: 'debate_started', round, slot, model }

    const debateDeltaQueue: Array<Readonly<{ round: number; slot: DrafterSlot; text: string }>> = []
    let debateDoneCount = 0
    const latestPerSlot = getLatestPerSlot(round)

    const debatePromises = liveDrafts.map(async (draft) => {
      const t0 = Date.now()
      try {
        const others = anonymizeOthers(latestPerSlot, draft.slot)
        const messages = buildDebateMessages({
          userTask,
          myDraft: draft.content,
          myPreviousDebate: previousDebatePerSlot.get(draft.slot) ?? null,
          othersLatest: others,
          round,
          totalRounds: debateRounds,
        })
        const final = await streamOne(
          chat,
          signal !== undefined ? { model: draft.model, messages, signal } : { model: draft.model, messages },
          (text) => { debateDeltaQueue.push({ round, slot: draft.slot, text }) },
        )
        const durationMs = Date.now() - t0
        return { kind: 'ok' as const, slot: draft.slot, model: draft.model, content: final.content, costCents: final.costCents, durationMs }
      } catch (e) {
        return { kind: 'failed' as const, slot: draft.slot, model: draft.model, error: coerceToAppError(e) }
      } finally { debateDoneCount++ }
    })

    while (debateDoneCount < liveDrafts.length) {
      if (debateDeltaQueue.length === 0) { await new Promise((r) => setTimeout(r, 50)); continue }
      while (debateDeltaQueue.length > 0) {
        const item = debateDeltaQueue.shift()
        if (item) yield { kind: 'debate_delta', round: item.round, slot: item.slot, text: item.text }
      }
    }
    while (debateDeltaQueue.length > 0) {
      const item = debateDeltaQueue.shift()
      if (item) yield { kind: 'debate_delta', round: item.round, slot: item.slot, text: item.text }
    }

    const settlements = await Promise.all(debatePromises)
    const liveDebatesThisRound: DebateResult[] = []

    for (const settlement of settlements) {
      if (settlement.kind === 'ok') {
        totalCostCents += settlement.costCents
        liveDebatesThisRound.push({ slot: settlement.slot, model: settlement.model, content: settlement.content, costCents: settlement.costCents })
        previousDebatePerSlot.set(settlement.slot, settlement.content)
        yield { kind: 'debate_done', round, slot: settlement.slot, model: settlement.model, content: settlement.content, costCents: settlement.costCents, durationMs: settlement.durationMs }
      } else {
        yield { kind: 'debate_failed', round, slot: settlement.slot, model: settlement.model, error: settlement.error }
      }
    }
    allDebateRounds.push(liveDebatesThisRound)
  }

  yield { kind: 'synthesis_started', model: config.chairman }
  const synthesisT0 = Date.now()
  const synthesisMessages: ReadonlyArray<ChatMessage> = buildSynthesisMessages({
    userTask,
    drafts: liveDrafts.map(({ slot, content }) => ({ slot, content })),
    debateRounds: allDebateRounds.map((r) => r.map(({ slot, content }) => ({ slot, content }))),
  })

  let synthesisContent = ''
  let synthesisCost = 0
  try {
    for await (const chunk of chat.completionStream(
      signal !== undefined
        ? { model: config.chairman, messages: synthesisMessages, signal }
        : { model: config.chairman, messages: synthesisMessages },
    )) {
      if (chunk.kind === 'delta') {
        synthesisContent += chunk.text
        yield { kind: 'synthesis_delta', text: chunk.text }
      } else if (chunk.kind === 'done') {
        synthesisContent = chunk.content || synthesisContent
        synthesisCost = chunk.costCents
      }
    }
  } catch (e) {
    const err = coerceToAppError(e)
    yield { kind: 'council_failed', error: err, partialCostCents: totalCostCents }
    return Err(err)
  }

  const synthesisDuration = Date.now() - synthesisT0
  totalCostCents += synthesisCost
  const { answer: finalAnswerText, reasoning: chairmanReasoning } = splitChairmanOutput(synthesisContent)

  yield {
    kind: 'synthesis_done',
    model: config.chairman,
    content: finalAnswerText,
    reasoning: chairmanReasoning,
    costCents: synthesisCost,
    durationMs: synthesisDuration,
  }

  const totalDurationMs = Date.now() - startTime
  let billedTotalCents = totalCostCents
  if (balanceBefore !== null && getBalanceCents) {
    const balanceAfter = await getBalanceCents().catch(() => null)
    if (balanceAfter !== null) {
      const diff = balanceBefore - balanceAfter
      if (diff >= 0) billedTotalCents = diff
    }
  }

  yield {
    kind: 'council_done',
    finalAnswer: finalAnswerText,
    totalCostCents: billedTotalCents,
    totalDurationMs,
  }

  return Ok({ finalAnswer: finalAnswerText })
}

const REASONING_MARKER = '===COUNCIL_REASONING==='

export function splitChairmanOutput(raw: string): { answer: string; reasoning: string | null } {
  const idx = raw.indexOf(REASONING_MARKER)
  if (idx < 0) return { answer: raw.trim(), reasoning: null }
  const answer = raw.slice(0, idx).trim()
  const reasoning = raw.slice(idx + REASONING_MARKER.length).trim()
  return { answer, reasoning: reasoning || null }
}
