import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useT } from '@/presentation/hooks/useT'
import { useAppContainer } from '@/presentation/hooks/useAppContainer'
import { useActiveAgent } from '@/presentation/hooks/useActiveAgent'
import { useBalance } from '@/presentation/hooks/useBalance'
import { Card } from '@/presentation/components/ui/card'
import { Button } from '@/presentation/components/ui/button'

type Chain = 'solana' | 'polygon'
type Token = 'USDT' | 'USDC'

export function Wallet() {
  const t = useT()
  const agent = useActiveAgent()
  const { rest } = useAppContainer()
  const balance = useBalance()
  const qc = useQueryClient()
  const [generating, setGenerating] = useState(false)
  const [address, setAddress] = useState<string | null>(null)
  const [chain, setChain] = useState<Chain>('solana')
  const [token, setToken] = useState<Token>('USDC')

  const handleGenerate = useCallback(async () => {
    if (!agent) return
    setGenerating(true)
    try {
      const r = await rest.generateWallet(agent.apiKey, { chain, token })
      if (r.ok) {
        setAddress(r.value.address)
      } else {
        toast.error(t('err.unknown'))
      }
    } finally {
      setGenerating(false)
    }
  }, [agent, rest, chain, token, t])

  const handleCopy = useCallback(() => {
    if (!address) return
    void navigator.clipboard.writeText(address)
    toast.success(t('common.copied'))
  }, [address, t])

  if (!agent) return null

  const cents = balance.data?.availableUsdCents ?? 0
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">{t('wallet.title')}</h1>

      <Card className="p-6 space-y-3">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <div className="text-xs text-muted-foreground">{t('wallet.balance')}</div>
            <div className="text-3xl font-bold font-mono">${(cents / 100).toFixed(2)}</div>
          </div>
          {balance.data ? (
            <div className="text-xs text-muted-foreground space-y-0.5">
              <div>{t('wallet.deposited')}: ${balance.data.totalDepositedUsd.toFixed(2)}</div>
              <div>{t('wallet.spent')}: ${balance.data.totalSpentUsd.toFixed(2)}</div>
            </div>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ['balance', agent.id] })}
            disabled={balance.isFetching}
          >
            {balance.isFetching ? t('wallet.refreshing') : t('wallet.refresh')}
          </Button>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Generate deposit address</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Selector label="Chain" value={chain} options={['solana', 'polygon']} onChange={(v) => setChain(v as Chain)} />
          <Selector label="Token" value={token} options={['USDC', 'USDT']} onChange={(v) => setToken(v as Token)} />
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? t('wallet.generating') : t('wallet.generate', { chain, token })}
          </Button>
        </div>

        {address ? (
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
            <div className="text-xs text-muted-foreground">{t('wallet.address')} ({chain} · {token})</div>
            <div className="flex items-center gap-2">
              <code className="font-mono text-sm break-all flex-1">{address}</code>
              <Button size="sm" variant="outline" onClick={handleCopy}>
                {t('wallet.copyAddress')}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t('wallet.empty')}</p>
        )}
      </Card>
    </div>
  )
}

function Selector({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex gap-1 border border-border rounded-md p-0.5">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className={`px-2 py-0.5 rounded text-xs ${o === value ? 'bg-foreground/15 font-semibold' : 'text-muted-foreground'}`}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  )
}
