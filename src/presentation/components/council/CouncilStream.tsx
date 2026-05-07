import { useState } from 'react'
import { useT } from '@/presentation/hooks/useT'
import type { CouncilEvent } from '@/domain/councilEvents'
import type { DrafterSlot } from '@/domain/council'
import { describeError } from '@/domain/errors'
import { Card } from '@/presentation/components/ui/card'
import { Button } from '@/presentation/components/ui/button'

const REASONING_MARKER = '===COUNCIL_REASONING==='

type Props = Readonly<{ events: ReadonlyArray<CouncilEvent>; isRunning: boolean }>

type DraftBucket = {
  slot: DrafterSlot
  model: string | null
  text: string
  done: boolean
  failed: boolean
  failureReason: string | null
  costCents: number | null
  durationMs: number | null
}

type DebateBucket = {
  round: number
  slot: DrafterSlot
  model: string | null
  text: string
  done: boolean
  failed: boolean
  failureReason: string | null
  costCents: number | null
  durationMs: number | null
}

type SynthesisBucket = {
  model: string | null
  text: string
  reasoning: string
  reasoningStarted: boolean
  done: boolean
  costCents: number | null
  durationMs: number | null
}

type Reduced = {
  totalRounds: number | null
  drafts: Map<DrafterSlot, DraftBucket>
  debates: Map<string, DebateBucket> // key = `${round}-${slot}`
  synthesis: SynthesisBucket | null
  failed: boolean
}

function emptyReduced(): Reduced {
  return {
    totalRounds: null,
    drafts: new Map(),
    debates: new Map(),
    synthesis: null,
    failed: false,
  }
}

function reduceEvents(events: ReadonlyArray<CouncilEvent>): Reduced {
  const r = emptyReduced()

  const ensureDraft = (slot: DrafterSlot): DraftBucket => {
    let b = r.drafts.get(slot)
    if (!b) {
      b = {
        slot,
        model: null,
        text: '',
        done: false,
        failed: false,
        failureReason: null,
        costCents: null,
        durationMs: null,
      }
      r.drafts.set(slot, b)
    }
    return b
  }

  const debateKey = (round: number, slot: DrafterSlot): string => `${round}-${slot}`
  const ensureDebate = (round: number, slot: DrafterSlot): DebateBucket => {
    const key = debateKey(round, slot)
    let b = r.debates.get(key)
    if (!b) {
      b = {
        round,
        slot,
        model: null,
        text: '',
        done: false,
        failed: false,
        failureReason: null,
        costCents: null,
        durationMs: null,
      }
      r.debates.set(key, b)
    }
    return b
  }

  for (const e of events) {
    switch (e.kind) {
      case 'council_started':
        r.totalRounds = e.debateRounds
        break
      case 'draft_started': {
        const b = ensureDraft(e.slot)
        b.model = String(e.model)
        break
      }
      case 'draft_delta': {
        const b = ensureDraft(e.slot)
        b.text += e.text
        break
      }
      case 'draft_done': {
        const b = ensureDraft(e.slot)
        b.model = String(e.model)
        b.text = e.content || b.text
        b.done = true
        b.costCents = e.costCents
        b.durationMs = e.durationMs
        break
      }
      case 'draft_failed': {
        const b = ensureDraft(e.slot)
        b.model = String(e.model)
        b.failed = true
        b.failureReason = describeError(e.error)
        break
      }
      case 'debate_round_started':
        // no-op; rounds inferred from buckets
        break
      case 'debate_started': {
        const b = ensureDebate(e.round, e.slot)
        b.model = String(e.model)
        break
      }
      case 'debate_delta': {
        const b = ensureDebate(e.round, e.slot)
        b.text += e.text
        break
      }
      case 'debate_done': {
        const b = ensureDebate(e.round, e.slot)
        b.model = String(e.model)
        b.text = e.content || b.text
        b.done = true
        b.costCents = e.costCents
        b.durationMs = e.durationMs
        break
      }
      case 'debate_failed': {
        const b = ensureDebate(e.round, e.slot)
        b.model = String(e.model)
        b.failed = true
        b.failureReason = describeError(e.error)
        break
      }
      case 'synthesis_started':
        r.synthesis = {
          model: String(e.model),
          text: '',
          reasoning: '',
          reasoningStarted: false,
          done: false,
          costCents: null,
          durationMs: null,
        }
        break
      case 'synthesis_delta':
        if (r.synthesis) {
          if (r.synthesis.reasoningStarted) {
            r.synthesis.reasoning += e.text
          } else {
            const combined = r.synthesis.text + e.text
            const idx = combined.indexOf(REASONING_MARKER)
            if (idx >= 0) {
              r.synthesis.text = combined.slice(0, idx).trimEnd()
              r.synthesis.reasoning = combined.slice(idx + REASONING_MARKER.length).trimStart()
              r.synthesis.reasoningStarted = true
            } else {
              r.synthesis.text = combined
            }
          }
        }
        break
      case 'synthesis_done':
        r.synthesis = {
          model: String(e.model),
          text: e.content || (r.synthesis?.text ?? ''),
          reasoning: e.reasoning ?? r.synthesis?.reasoning ?? '',
          reasoningStarted: Boolean(e.reasoning) || Boolean(r.synthesis?.reasoningStarted),
          done: true,
          costCents: e.costCents,
          durationMs: e.durationMs,
        }
        break
      case 'council_failed':
        r.failed = true
        break
      case 'council_done':
        break
    }
  }

  return r
}

const SLOT_ORDER: ReadonlyArray<DrafterSlot> = ['A', 'B', 'C']

export function CouncilStream({ events, isRunning }: Props) {
  const t = useT()
  const r = reduceEvents(events)

  const draftsList = SLOT_ORDER.map((slot) => r.drafts.get(slot)).filter(
    (b): b is DraftBucket => Boolean(b),
  )

  // Group debates by round, ordered.
  const debatesByRound = new Map<number, DebateBucket[]>()
  for (const b of r.debates.values()) {
    const list = debatesByRound.get(b.round) ?? []
    list.push(b)
    debatesByRound.set(b.round, list)
  }
  const sortedRounds = [...debatesByRound.keys()].sort((a, b) => a - b)

  return (
    <div className="space-y-6">
      {/* 1. DRAFTS */}
      {draftsList.length > 0 ? (
        <section>
          <h3 className="font-semibold mb-3">{t('council.drafts')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {draftsList.map((b) => (
              <Card key={b.slot} className="p-3 text-sm">
                <div className="font-mono text-xs text-muted-foreground mb-2 flex items-center justify-between gap-2">
                  <span>
                    {t('council.drafter')} {b.slot}
                    {b.model ? <span className="ml-1">· {b.model}</span> : null}
                  </span>
                  {b.done ? <span className="text-emerald-600">✓</span> : null}
                  {b.failed ? <span className="text-destructive">✗</span> : null}
                </div>
                {b.failed ? (
                  <div className="text-destructive text-xs">
                    {t('council.draftFailed')}: {b.failureReason}
                  </div>
                ) : b.text ? (
                  <pre className="whitespace-pre-wrap font-sans text-xs">
                    {b.text}
                    {!b.done ? <span className="opacity-50">▌</span> : null}
                  </pre>
                ) : (
                  <div className="animate-pulse text-muted-foreground text-xs">
                    {t('council.drafting')}…
                  </div>
                )}
                {b.done && b.costCents !== null && b.durationMs !== null ? (
                  <div className="text-[10px] text-muted-foreground mt-2">
                    ${(b.costCents / 100).toFixed(4)} · {b.durationMs}ms
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {/* 2. DEBATES (multi-round) */}
      {sortedRounds.length > 0 ? (
        <section>
          <h3 className="font-semibold mb-3">{t('council.debates')}</h3>
          <div className="space-y-4">
            {sortedRounds.map((round) => {
              const list = (debatesByRound.get(round) ?? []).slice().sort((a, b) =>
                a.slot.localeCompare(b.slot),
              )
              return (
                <div key={round} className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    {t('council.round')} {round}
                    {r.totalRounds ? ` / ${r.totalRounds}` : ''}
                  </div>
                  <div className="space-y-2">
                    {list.map((b) => (
                      <details
                        key={`${b.round}-${b.slot}`}
                        className="rounded-lg border border-border bg-card p-3 text-sm"
                        open
                      >
                        <summary className="cursor-pointer font-medium flex items-center gap-2">
                          <span>
                            {t('council.drafter')} {b.slot}
                            {b.model ? (
                              <span className="font-mono text-xs text-muted-foreground ml-1">
                                · {b.model}
                              </span>
                            ) : null}
                          </span>
                          {b.done ? <span className="text-emerald-600 text-xs">✓</span> : null}
                          {b.failed ? <span className="text-destructive text-xs">✗</span> : null}
                          {b.done && b.costCents !== null ? (
                            <span className="text-[10px] text-muted-foreground ml-auto">
                              ${(b.costCents / 100).toFixed(4)}
                            </span>
                          ) : null}
                        </summary>
                        {b.failed ? (
                          <div className="text-destructive text-xs mt-2">
                            {b.failureReason}
                          </div>
                        ) : b.text ? (
                          <pre className="whitespace-pre-wrap font-sans mt-2 text-xs">
                            {b.text}
                            {!b.done ? <span className="opacity-50">▌</span> : null}
                          </pre>
                        ) : (
                          <div className="animate-pulse text-muted-foreground text-xs mt-2">
                            {t('council.debating')}…
                          </div>
                        )}
                      </details>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ) : null}

      {/* 3. SYNTHESIS / FINAL ANSWER */}
      {r.synthesis ? (
        <SynthesisCard bucket={r.synthesis} isRunning={isRunning} failed={r.failed} />
      ) : null}
    </div>
  )
}

function SynthesisCard({
  bucket,
  isRunning,
  failed,
}: {
  bucket: SynthesisBucket
  isRunning: boolean
  failed: boolean
}) {
  const t = useT()
  const [showReasoning, setShowReasoning] = useState(false)
  const hasReasoning = bucket.reasoning.trim().length > 0
  return (
    <Card className="p-5 border-2 border-primary">
      <h2 className="text-lg font-bold mb-3">{t('council.finalAnswer')}</h2>
      <pre className="whitespace-pre-wrap text-sm font-sans">
        {bucket.text}
        {!bucket.done ? <span className="opacity-50">▌</span> : null}
      </pre>
      {bucket.done && bucket.costCents !== null ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="text-xs text-muted-foreground">
            {t('council.synthesizedBy')}{' '}
            <span className="font-mono">{bucket.model}</span> · $
            {(bucket.costCents / 100).toFixed(4)} · {bucket.durationMs}ms
          </div>
          {hasReasoning ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowReasoning((v) => !v)}
            >
              {showReasoning ? t('council.hideReasoning') : t('council.viewReasoning')}
            </Button>
          ) : null}
        </div>
      ) : isRunning ? (
        <div className="text-xs text-muted-foreground mt-4 animate-pulse">
          {t('council.synthesizing')}…
        </div>
      ) : failed ? (
        <div className="text-xs text-destructive mt-4">
          {t('council.synthesisInterrupted')}
        </div>
      ) : null}
      {bucket.done && hasReasoning && showReasoning ? (
        <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4">
          <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
            {t('council.reasoningTitle')}
          </div>
          <pre className="whitespace-pre-wrap text-sm font-sans">{bucket.reasoning}</pre>
        </div>
      ) : null}
    </Card>
  )
}
