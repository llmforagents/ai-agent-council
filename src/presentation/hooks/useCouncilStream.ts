import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { CouncilConfig, CouncilPlan } from '@/domain/council'
import type { CouncilEvent } from '@/domain/councilEvents'
import { runCouncilChat, makeRestChatPort } from '@/application/runCouncilChat'
import { useAppContainer } from './useAppContainer'
import { useActiveAgent } from './useActiveAgent'
import { useCouncilStore, type CouncilSnapshot } from './useCouncilStore'

export type CouncilUiState = Readonly<{
  isRunning: boolean
  events: ReadonlyArray<CouncilEvent>
  finalAnswer: string | null
  totalCostCents: number
  error: string | null
  activeRunId: string | null
  activeTimestamp: string | null
  activePlan: CouncilPlan | null
  activeTask: string | null
}>

const INITIAL: CouncilUiState = {
  isRunning: false,
  events: [],
  finalAnswer: null,
  totalCostCents: 0,
  error: null,
  activeRunId: null,
  activeTimestamp: null,
  activePlan: null,
  activeTask: null,
}

function fromSnapshot(snap: CouncilSnapshot): CouncilUiState {
  return {
    isRunning: false,
    events: snap.events,
    finalAnswer: snap.finalAnswer,
    totalCostCents: snap.totalCostCents,
    error: snap.error,
    activeRunId: snap.id,
    activeTimestamp: snap.timestamp,
    activePlan: snap.plan,
    activeTask: snap.userTask,
  }
}

function newRunId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function useCouncilStream(): {
  state: CouncilUiState
  runs: ReadonlyArray<CouncilSnapshot>
  start: (args: { config: CouncilConfig; userTask: string; plan: CouncilPlan }) => void
  selectRun: (runId: string) => void
  closeRun: () => void
  deleteRun: (runId: string) => void
  clearHistory: () => void
} {
  const { rest, apiBase } = useAppContainer()
  const agent = useActiveAgent()
  const queryClient = useQueryClient()
  const bucket = useCouncilStore((s) => (agent ? s.byAgent[agent.id] : undefined))
  const addRun = useCouncilStore((s) => s.addRun)
  const setActiveRun = useCouncilStore((s) => s.setActiveRun)
  const deleteRunStore = useCouncilStore((s) => s.deleteRun)
  const clearAllRuns = useCouncilStore((s) => s.clearAllRuns)

  const activeSnapshot = bucket?.activeRunId
    ? bucket.runs.find((r) => r.id === bucket.activeRunId)
    : undefined

  const [state, setState] = useState<CouncilUiState>(() =>
    activeSnapshot ? fromSnapshot(activeSnapshot) : INITIAL,
  )
  const abortRef = useRef<AbortController | null>(null)
  const lastHydratedKey = useRef<string>(`${agent?.id ?? ''}::${bucket?.activeRunId ?? ''}`)

  useEffect(() => {
    const key = `${agent?.id ?? ''}::${bucket?.activeRunId ?? ''}`
    if (key === lastHydratedKey.current) return
    lastHydratedKey.current = key
    setState((prev) => {
      if (prev.isRunning) return prev
      return activeSnapshot ? fromSnapshot(activeSnapshot) : INITIAL
    })
  }, [agent?.id, bucket?.activeRunId, activeSnapshot])

  const start = useCallback(
    (args: { config: CouncilConfig; userTask: string; plan: CouncilPlan }) => {
      if (!agent) {
        setState({ ...INITIAL, error: 'No active agent — sign in first.' })
        return
      }
      if (abortRef.current) abortRef.current.abort()
      const ac = new AbortController()
      abortRef.current = ac

      const runId = newRunId()
      setState({ ...INITIAL, isRunning: true, activeRunId: runId })

      const chat = makeRestChatPort(rest, agent.apiKey)
      const getBalanceCents = async (): Promise<number | null> => {
        const r = await rest.getBalance(agent.apiKey)
        return r.ok ? r.value.availableUsdCents : null
      }

      void (async () => {
        const collectedEvents: CouncilEvent[] = []
        let finalAnswer: string | null = null
        let totalCostCents = 0
        let errMessage: string | null = null
        try {
          const generator = runCouncilChat(
            {
              chat,
              getBalanceCents,
              apiKey: agent.apiKey,
              sdkConfig: { baseUrl: apiBase },
            },
            { config: args.config, userTask: args.userTask },
          )
          for await (const event of generator) {
            if (ac.signal.aborted) return
            collectedEvents.push(event)
            if (event.kind === 'council_done') {
              finalAnswer = event.finalAnswer
              totalCostCents = event.totalCostCents
            } else if (event.kind === 'council_failed') {
              errMessage = event.error.kind
              totalCostCents = event.partialCostCents
            }
            setState((prev) => {
              const next: CouncilUiState = { ...prev, events: [...prev.events, event] }
              if (event.kind === 'council_done') {
                return {
                  ...next,
                  isRunning: false,
                  finalAnswer: event.finalAnswer,
                  totalCostCents: event.totalCostCents,
                }
              }
              if (event.kind === 'council_failed') {
                return {
                  ...next,
                  isRunning: false,
                  error: event.error.kind,
                  totalCostCents: event.partialCostCents,
                }
              }
              return next
            })
          }
        } catch (e) {
          if (ac.signal.aborted) return
          errMessage = e instanceof Error ? e.message : String(e)
          setState((prev) => ({ ...prev, isRunning: false, error: errMessage }))
        } finally {
          // Persist if the run completed naturally (council_done/council_failed
          // already emitted), even when an abort fired immediately after — the
          // race happens when the user clicks "Nueva corrida" or navigates the
          // moment the button enables, before the finally has had a chance to
          // call addRun. Aborts that hit BEFORE completion still skip persist.
          const ranToCompletion = collectedEvents.some(
            (e) => e.kind === 'council_done' || e.kind === 'council_failed',
          )
          if ((ranToCompletion || !ac.signal.aborted) && agent) {
            const persistableEvents = collectedEvents.filter(
              (e) =>
                e.kind !== 'draft_delta' &&
                e.kind !== 'debate_delta' &&
                e.kind !== 'synthesis_delta',
            )
            const snapshot: CouncilSnapshot = {
              id: runId,
              timestamp: new Date().toISOString(),
              plan: args.plan,
              userTask: args.userTask,
              events: persistableEvents,
              finalAnswer,
              totalCostCents,
              error: errMessage,
            }
            addRun(agent.id, snapshot)
            lastHydratedKey.current = `${agent.id}::${runId}`
            setState((prev) => ({
              ...prev,
              activeRunId: snapshot.id,
              activeTimestamp: snapshot.timestamp,
              activePlan: snapshot.plan,
              activeTask: snapshot.userTask,
            }))
            // Refresh balance after a run lands
            void queryClient.invalidateQueries({ queryKey: ['balance', agent.id] })
          }
        }
      })()
    },
    [rest, apiBase, agent, addRun, queryClient],
  )

  const selectRun = useCallback(
    (runId: string) => {
      if (!agent) return
      if (abortRef.current) abortRef.current.abort()
      setActiveRun(agent.id, runId)
    },
    [agent, setActiveRun],
  )

  const closeRun = useCallback(() => {
    if (abortRef.current) abortRef.current.abort()
    if (agent) setActiveRun(agent.id, null)
    setState(INITIAL)
  }, [agent, setActiveRun])

  const deleteRun = useCallback(
    (runId: string) => {
      if (!agent) return
      deleteRunStore(agent.id, runId)
    },
    [agent, deleteRunStore],
  )

  const clearHistory = useCallback(() => {
    if (!agent) return
    if (abortRef.current) abortRef.current.abort()
    clearAllRuns(agent.id)
    setState(INITIAL)
  }, [agent, clearAllRuns])

  return {
    state,
    runs: bucket?.runs ?? [],
    start,
    selectRun,
    closeRun,
    deleteRun,
    clearHistory,
  }
}
