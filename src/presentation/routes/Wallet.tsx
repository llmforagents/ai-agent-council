import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { useT } from '@/presentation/hooks/useT'
import { useAppContainer } from '@/presentation/hooks/useAppContainer'
import { useActiveAgent } from '@/presentation/hooks/useActiveAgent'
import { useBalance } from '@/presentation/hooks/useBalance'
import { useWalletStore, type StoredWallet } from '@/presentation/hooks/useWalletStore'
import { Card } from '@/presentation/components/ui/card'
import { Button } from '@/presentation/components/ui/button'

const CHAINS = ['solana', 'polygon'] as const
const TOKENS = ['USDC', 'USDT'] as const

type Chain = (typeof CHAINS)[number]
type Token = (typeof TOKENS)[number]

const EMPTY_WALLETS: ReadonlyArray<StoredWallet> = []

function fmtUsd(cents: number): string {
  const usd = cents / 100
  if (usd !== 0 && Math.abs(usd) < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(2)}`
}

function shortAddr(addr: string): string {
  if (addr.length <= 14) return addr
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`
}

export function Wallet() {
  const t = useT()
  const agent = useActiveAgent()
  const { rest } = useAppContainer()
  const balance = useBalance()
  const byAgent = useWalletStore((s) => s.byAgent)
  const wallets = agent ? byAgent[agent.id] ?? EMPTY_WALLETS : EMPTY_WALLETS
  const upsertWallet = useWalletStore((s) => s.upsert)
  const removeWallet = useWalletStore((s) => s.remove)
  const [chain, setChain] = useState<Chain>('solana')
  const [token, setToken] = useState<Token>('USDC')
  const [generating, setGenerating] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const handleGenerate = useCallback(async () => {
    if (!agent) return
    setGenerating(true)
    try {
      const r = await rest.generateWallet(agent.apiKey, { chain, token })
      if (r.ok) {
        upsertWallet(agent.id, {
          chain: r.value.chain,
          token: r.value.token,
          address: r.value.address,
          createdAt: r.value.createdAt,
        })
        toast.success(`${chain.toUpperCase()} · ${token}`, { description: 'Address ready' })
      } else {
        toast.error('Generate failed')
      }
    } finally {
      setGenerating(false)
    }
  }, [agent, rest, chain, token, upsertWallet])

  const handleSyncAll = useCallback(async () => {
    if (!agent) return
    setSyncing(true)
    let ok = 0
    try {
      for (const c of CHAINS) {
        for (const tk of TOKENS) {
          const r = await rest.generateWallet(agent.apiKey, { chain: c, token: tk })
          if (r.ok) {
            upsertWallet(agent.id, {
              chain: r.value.chain,
              token: r.value.token,
              address: r.value.address,
              createdAt: r.value.createdAt,
            })
            ok++
          }
        }
      }
      toast.success(`Synced ${ok} wallet${ok === 1 ? '' : 's'}`)
    } finally {
      setSyncing(false)
    }
  }, [agent, rest, upsertWallet])

  const handleRefresh = useCallback(async () => {
    if (!agent) return
    setRefreshing(true)
    try {
      const prev = balance.data?.availableUsdCents ?? 0
      const r = await balance.refetch()
      const next = r.data?.availableUsdCents ?? prev
      const diff = next - prev
      if (diff > 0) toast.success('Balance up', { description: `+${fmtUsd(diff)}` })
      else if (diff < 0) toast.info('Balance down', { description: fmtUsd(diff) })
      else toast.info('Balance unchanged')
    } finally {
      setRefreshing(false)
    }
  }, [agent, balance])

  const handleCopy = useCallback((address: string): void => {
    void navigator.clipboard.writeText(address)
    toast.success(t('common.copied'))
  }, [t])

  if (!agent) return null

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Card className="p-6 flex flex-col items-center text-center gap-3 bg-gradient-to-br from-primary/10 to-transparent border-primary/20">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {t('settings.activeAgent')}
        </div>
        <div className="text-xl sm:text-2xl font-bold break-all">{agent.name}</div>
        <div className="text-base sm:text-lg font-semibold mt-1">{t('wallet.balance')}</div>
        <div className="text-4xl sm:text-5xl font-bold tabular-nums break-all">
          {balance.data ? fmtUsd(balance.data.availableUsdCents) : '—'}
        </div>
        {balance.data ? (
          <div className="text-xs text-muted-foreground flex gap-4 flex-wrap justify-center">
            <span>{t('wallet.deposited')} <b>${balance.data.totalDepositedUsd.toFixed(2)}</b></span>
            <span>{t('wallet.spent')} <b>${balance.data.totalSpentUsd.toFixed(2)}</b></span>
          </div>
        ) : null}
        <div className="flex items-center gap-2 mt-2">
          <Button size="sm" onClick={handleRefresh} disabled={refreshing || balance.isFetching}>
            {refreshing || balance.isFetching ? t('wallet.refreshing') : t('wallet.refresh')}
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <div className="text-center mb-4">
          <h2 className="text-lg font-semibold">Generate deposit address</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Same chain + token returns the same address (idempotent).
          </p>
        </div>

        <div className="mx-auto max-w-xl space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1 text-center">Chain</label>
              <Segmented options={CHAINS} value={chain} onChange={(v) => setChain(v as Chain)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1 text-center">Token</label>
              <Segmented options={TOKENS} value={token} onChange={(v) => setToken(v as Token)} />
            </div>
          </div>

          <Button className="w-full" onClick={handleGenerate} disabled={generating}>
            {generating ? t('wallet.generating') : t('wallet.generate', { chain, token })}
          </Button>
        </div>
      </Card>

      <section>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-lg font-semibold">Your deposit addresses</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {wallets.length} saved
            </span>
            <Button size="sm" variant="secondary" onClick={handleSyncAll} disabled={syncing}>
              {syncing ? 'Syncing…' : 'Sync all'}
            </Button>
          </div>
        </div>

        {wallets.length === 0 ? (
          <Card className="p-8 text-center space-y-2">
            <p className="text-sm text-muted-foreground">{t('wallet.empty')}</p>
            <p className="text-xs text-muted-foreground">
              Already generated wallets for this agent on another session? Click Sync all above.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {wallets.map((w) => (
              <WalletCard
                key={`${w.chain}-${w.token}`}
                wallet={w}
                onCopy={handleCopy}
                onRemove={() => removeWallet(agent.id, w.chain, w.token)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function Segmented({ options, value, onChange }: { options: ReadonlyArray<string>; value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid gap-1 rounded-lg border border-border bg-muted/30 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={`py-1.5 text-sm rounded-md transition-colors ${o === value ? 'bg-foreground/15 text-foreground shadow-sm font-medium ring-1 ring-foreground/10' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

function WalletCard({ wallet, onCopy, onRemove }: { wallet: StoredWallet; onCopy: (addr: string) => void; onRemove: () => void }) {
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${wallet.chain === 'solana' ? 'bg-purple-500/15 text-purple-500' : 'bg-violet-500/15 text-violet-500'}`}>
          {wallet.chain}
        </span>
        <span className="rounded bg-emerald-500/15 text-emerald-600 px-2 py-0.5 text-xs font-semibold">
          {wallet.token}
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {new Date(wallet.createdAt).toLocaleDateString()}
        </span>
      </div>
      <div>
        <div className="text-[10px] text-muted-foreground mb-1">Address</div>
        <input
          readOnly
          value={wallet.address}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full font-mono text-xs rounded-lg border border-border bg-muted/30 px-2.5 py-2 select-all outline-none focus:ring-3 focus:ring-ring/50"
          title={wallet.address}
        />
        <div className="text-[10px] text-muted-foreground mt-1 font-mono">{shortAddr(wallet.address)}</div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={() => onCopy(wallet.address)}>
          Copy
        </Button>
        <Button size="sm" variant="ghost" onClick={onRemove}>
          Remove local
        </Button>
      </div>
    </Card>
  )
}
