import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PersistStorage, StorageValue } from 'zustand/middleware'
import { toast } from 'sonner'
import { translate } from '@/domain/i18n'
import { useAppStore } from './useAppStore'
import type { AgentId } from '@/domain/branded'
import type { CouncilEvent } from '@/domain/councilEvents'
import type { CouncilPlan } from '@/domain/council'

export type CouncilSnapshot = Readonly<{
  id: string
  timestamp: string
  plan: CouncilPlan
  userTask: string
  events: ReadonlyArray<CouncilEvent>
  finalAnswer: string | null
  totalCostCents: number
  error: string | null
}>

export type CouncilAgentBucket = Readonly<{
  activeRunId: string | null
  runs: ReadonlyArray<CouncilSnapshot>
}>

const EMPTY_BUCKET: CouncilAgentBucket = { activeRunId: null, runs: [] }

export const MAX_RUNS_PER_PLAN = 5 as const

type CouncilStoreState = {
  readonly byAgent: Readonly<Record<string, CouncilAgentBucket>>
  addRun: (agentId: AgentId, snapshot: CouncilSnapshot) => void
  setActiveRun: (agentId: AgentId, runId: string | null) => void
  deleteRun: (agentId: AgentId, runId: string) => void
  clearAllRuns: (agentId: AgentId) => void
}

const STORAGE_KEY = 'llm4agents-council'

function capByPlan(runs: ReadonlyArray<CouncilSnapshot>): ReadonlyArray<CouncilSnapshot> {
  const counts: Record<CouncilPlan, number> = { lite: 0, pro: 0, power: 0 }
  const kept: CouncilSnapshot[] = []
  for (const run of runs) {
    if (counts[run.plan] < MAX_RUNS_PER_PLAN) {
      kept.push(run)
      counts[run.plan]++
    }
  }
  return kept
}

function makeSafeStorage(): PersistStorage<Pick<CouncilStoreState, 'byAgent'>> {
  let quotaToasted = false
  return {
    getItem: (name) => {
      const raw = localStorage.getItem(name)
      if (raw === null) return null
      const parsed = JSON.parse(raw) as StorageValue<{ byAgent: Record<string, unknown> }>
      const migrated = migrateLegacyShape(parsed.state.byAgent)
      return {
        ...parsed,
        state: { byAgent: migrated },
      } as StorageValue<Pick<CouncilStoreState, 'byAgent'>>
    },
    setItem: (name, value) => {
      try {
        localStorage.setItem(name, JSON.stringify(value))
        quotaToasted = false
      } catch {
        if (!quotaToasted) {
          const locale = useAppStore.getState().locale
          toast.error(translate(locale, 'council.persistFull'))
          quotaToasted = true
        }
      }
    },
    removeItem: (name) => { localStorage.removeItem(name) },
  }
}

/**
 * v1 of this store persisted `byAgent: Record<AgentId, CouncilSnapshot>`.
 * v2 (this) persists `byAgent: Record<AgentId, { activeRunId, runs[] }>`.
 * Lift the old single-snapshot into a 1-element bucket so users don't lose data.
 */
function migrateLegacyShape(byAgent: Record<string, unknown>): Record<string, CouncilAgentBucket> {
  const out: Record<string, CouncilAgentBucket> = {}
  for (const [agentId, value] of Object.entries(byAgent)) {
    if (value && typeof value === 'object' && 'runs' in value && 'activeRunId' in value) {
      out[agentId] = value as CouncilAgentBucket
    } else if (value && typeof value === 'object' && 'id' in value && 'events' in value) {
      const snap = value as CouncilSnapshot
      out[agentId] = { activeRunId: snap.id, runs: [snap] }
    }
  }
  return out
}

const safeStorage = makeSafeStorage()

export const useCouncilStore = create<CouncilStoreState>()(
  persist(
    (set) => ({
      byAgent: {},
      addRun: (agentId, snapshot) =>
        set((s) => {
          const prev = s.byAgent[agentId] ?? EMPTY_BUCKET
          const nextRuns = capByPlan([snapshot, ...prev.runs])
          return {
            byAgent: {
              ...s.byAgent,
              [agentId]: { activeRunId: snapshot.id, runs: nextRuns },
            },
          }
        }),
      setActiveRun: (agentId, runId) =>
        set((s) => {
          const prev = s.byAgent[agentId] ?? EMPTY_BUCKET
          if (runId !== null && !prev.runs.some((r) => r.id === runId)) return s
          return {
            byAgent: {
              ...s.byAgent,
              [agentId]: { ...prev, activeRunId: runId },
            },
          }
        }),
      deleteRun: (agentId, runId) =>
        set((s) => {
          const prev = s.byAgent[agentId]
          if (!prev) return s
          const nextRuns = prev.runs.filter((r) => r.id !== runId)
          const nextActive = prev.activeRunId === runId ? null : prev.activeRunId
          return {
            byAgent: {
              ...s.byAgent,
              [agentId]: { activeRunId: nextActive, runs: nextRuns },
            },
          }
        }),
      clearAllRuns: (agentId) =>
        set((s) => {
          if (!(agentId in s.byAgent)) return s
          const next: Record<string, CouncilAgentBucket> = { ...s.byAgent }
          delete next[agentId]
          return { byAgent: next }
        }),
    }),
    {
      name: STORAGE_KEY,
      storage: safeStorage,
      partialize: (s) => ({ byAgent: s.byAgent }),
    },
  ),
)
