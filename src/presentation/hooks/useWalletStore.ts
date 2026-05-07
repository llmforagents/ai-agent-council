import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AgentId } from '@/domain/branded'

export type StoredWallet = Readonly<{
  chain: 'solana' | 'polygon'
  token: 'USDT' | 'USDC'
  address: string
  createdAt: string
}>

type WalletStoreState = {
  readonly byAgent: Readonly<Record<string, ReadonlyArray<StoredWallet>>>
  upsert: (agentId: AgentId, wallet: StoredWallet) => void
  remove: (agentId: AgentId, chain: 'solana' | 'polygon', token: 'USDT' | 'USDC') => void
  clearForAgent: (agentId: AgentId) => void
}

export const useWalletStore = create<WalletStoreState>()(
  persist(
    (set) => ({
      byAgent: {},
      upsert: (agentId, wallet) =>
        set((s) => {
          const prev = s.byAgent[agentId] ?? []
          const filtered = prev.filter((w) => !(w.chain === wallet.chain && w.token === wallet.token))
          const next = [...filtered, wallet].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          return { byAgent: { ...s.byAgent, [agentId]: next } }
        }),
      remove: (agentId, chain, token) =>
        set((s) => {
          const prev = s.byAgent[agentId] ?? []
          const next = prev.filter((w) => !(w.chain === chain && w.token === token))
          return { byAgent: { ...s.byAgent, [agentId]: next } }
        }),
      clearForAgent: (agentId) =>
        set((s) => {
          if (!(agentId in s.byAgent)) return s
          const next: Record<string, ReadonlyArray<StoredWallet>> = { ...s.byAgent }
          delete next[agentId]
          return { byAgent: next }
        }),
    }),
    {
      name: 'council-wallets',
      partialize: (s) => ({ byAgent: s.byAgent }),
    },
  ),
)
