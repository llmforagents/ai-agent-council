import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Locale } from '@/domain/i18n'
import type { Agent } from '@/domain/agent'
import { AgentId, ApiKey } from '@/domain/branded'

type Theme = 'light' | 'dark'

type AppState = {
  agent: Agent | null
  theme: Theme
  locale: Locale
  setAgent: (agent: Agent | null) => void
  renameAgent: (name: string) => void
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  setLocale: (l: Locale) => void
}

const STORAGE_KEY = 'council-app'

type Persisted = Readonly<{
  agent: { id: string; name: string; apiKey: string; createdAt: string } | null
  theme: Theme
  locale: Locale
}>

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      agent: null,
      theme: 'dark',
      locale: 'en',
      setAgent: (agent) => set({ agent }),
      renameAgent: (name) => set((s) => (s.agent ? { agent: { ...s.agent, name } } : s)),
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      setLocale: (locale) => set({ locale }),
    }),
    {
      name: STORAGE_KEY,
      partialize: (s): Persisted => ({
        agent: s.agent
          ? {
              id: String(s.agent.id),
              name: s.agent.name,
              apiKey: String(s.agent.apiKey),
              createdAt: s.agent.createdAt.toISOString(),
            }
          : null,
        theme: s.theme,
        locale: s.locale,
      }),
      merge: (persisted, current) => {
        const p = persisted as Persisted | undefined
        if (!p?.agent) {
          return { ...current, ...(p ?? {}), agent: null }
        }
        // Migrate legacy placeholder names ("Imported agent" or empty) to a
        // uuid-prefixed default so the hero always renders something.
        const rawName = p.agent.name.trim()
        const isLegacy = rawName === '' || rawName === 'Imported agent'
        const name = isLegacy ? `Agent ${p.agent.id.slice(0, 8)}` : rawName
        return {
          ...current,
          ...p,
          agent: {
            id: AgentId(p.agent.id),
            name,
            apiKey: ApiKey(p.agent.apiKey),
            createdAt: new Date(p.agent.createdAt),
          },
        }
      },
    },
  ),
)
