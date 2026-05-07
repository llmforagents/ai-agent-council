import { useMemo, useState } from 'react'
import { useT } from '@/presentation/hooks/useT'
import { useTransactions } from '@/presentation/hooks/useTransactions'
import type { TransactionInfo, TransactionType } from '@/application/ports'
import type { MessageKey } from '@/domain/i18n'
import { Card } from '@/presentation/components/ui/card'
import { Button } from '@/presentation/components/ui/button'

const TX_FILTERS = ['all', 'deposit', 'usage', 'refund'] as const
type TxFilter = (typeof TX_FILTERS)[number]
const TX_PAGE = 25

const TX_FILTER_LABELS: Record<TxFilter, MessageKey> = {
  all: 'tx.filterAll',
  deposit: 'tx.filterDeposit',
  usage: 'tx.filterUsage',
  refund: 'tx.filterRefund',
}

function fmtUsd(cents: number): string {
  const abs = Math.abs(cents) / 100
  const digits = abs !== 0 && abs < 0.01 ? 4 : 2
  const sign = cents < 0 ? '-' : ''
  return `${sign}$${abs.toFixed(digits)}`
}

function txTypeStyle(type: TransactionType): string {
  switch (type) {
    case 'deposit': return 'bg-emerald-500/15 text-emerald-600'
    case 'usage': return 'bg-orange-500/15 text-orange-600'
    case 'refund': return 'bg-sky-500/15 text-sky-600'
  }
}

function txAmountClass(type: TransactionType): string {
  if (type === 'deposit' || type === 'refund') return 'text-emerald-600'
  return 'text-orange-600'
}

function txAmountSign(type: TransactionType, cents: number): string {
  if (type === 'deposit' || type === 'refund') return cents >= 0 ? '+' : ''
  return cents > 0 ? '-' : ''
}

export function Transactions() {
  const t = useT()
  const [filter, setFilter] = useState<TxFilter>('all')
  const [offset, setOffset] = useState(0)
  const q = useTransactions({
    ...(filter !== 'all' ? { type: filter } : {}),
    limit: TX_PAGE,
    offset,
  })

  const txns: ReadonlyArray<TransactionInfo> = useMemo(
    () => q.data?.transactions ?? [],
    [q.data?.transactions],
  )
  const total = q.data?.total ?? 0

  const totals = useMemo(() => {
    const agg = { deposit: 0, usage: 0, refund: 0 }
    for (const tx of txns) agg[tx.type] += tx.amountCents
    return agg
  }, [txns])

  const from = total === 0 ? 0 : offset + 1
  const to = Math.min(offset + TX_PAGE, total)
  const canPrev = offset > 0
  const canNext = offset + TX_PAGE < total
  const page = Math.floor(offset / TX_PAGE) + 1
  const pages = Math.max(1, Math.ceil(total / TX_PAGE))

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="text-center space-y-1">
        <h1 className="text-2xl sm:text-3xl font-bold">{t('tx.title')}</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <TxStatCard label={t('tx.statsDeposits')} hint={t('tx.statsHint')} value={fmtUsd(totals.deposit)} accent="emerald" />
        <TxStatCard label={t('tx.statsUsage')} hint={t('tx.statsHint')} value={fmtUsd(totals.usage)} accent="orange" />
        <TxStatCard label={t('tx.statsRefunds')} hint={t('tx.statsHint')} value={fmtUsd(totals.refund)} accent="sky" />
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <h2 className="text-lg font-semibold">{t('tx.title')}</h2>
          <span className="text-xs text-muted-foreground">
            {total === 0 ? '0' : t('tx.rangeOf', { from, to, total })}
          </span>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-1 grid grid-cols-4 gap-1 mb-4">
          {TX_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => { setFilter(f); setOffset(0) }}
              className={`py-1.5 text-sm rounded-md transition-colors ${filter === f ? 'bg-foreground/15 text-foreground shadow-sm font-medium ring-1 ring-foreground/10' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}
            >
              {t(TX_FILTER_LABELS[f])}
            </button>
          ))}
        </div>

        {q.isLoading ? (
          <div className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
            {t('common.loading')}
          </div>
        ) : txns.length === 0 ? (
          <div className="rounded-lg border border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {filter === 'all' ? t('tx.emptyAll') : t('tx.emptyFiltered', { type: filter })}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">{t('tx.type')}</th>
                  <th className="px-3 py-2 font-medium text-right">{t('tx.amount')}</th>
                  <th className="px-3 py-2 font-medium">{t('tx.when')}</th>
                  <th className="px-3 py-2 font-medium">{t('tx.description')}</th>
                </tr>
              </thead>
              <tbody>
                {txns.map((tx) => (
                  <tr key={tx.id} className="border-t border-border hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${txTypeStyle(tx.type)}`}>
                        {tx.type}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums font-medium ${txAmountClass(tx.type)}`}>
                      {txAmountSign(tx.type, tx.amountCents)}{fmtUsd(Math.abs(tx.amountCents))}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                      {new Date(tx.timestamp).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {tx.description ?? tx.model ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between mt-4 flex-wrap gap-2">
          <span className="text-xs text-muted-foreground">
            {t('tx.pageOf', { page, total: pages })}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={!canPrev} onClick={() => setOffset(Math.max(0, offset - TX_PAGE))}>
              {t('tx.prev')}
            </Button>
            <Button size="sm" variant="secondary" disabled={!canNext} onClick={() => setOffset(offset + TX_PAGE)}>
              {t('tx.next')}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

function TxStatCard({ label, hint, value, accent }: { label: string; hint: string; value: string; accent: 'emerald' | 'orange' | 'sky' }) {
  const accentClass =
    accent === 'emerald' ? 'text-emerald-600' :
    accent === 'orange' ? 'text-orange-600' : 'text-sky-600'
  return (
    <Card className="p-4">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="text-[10px] text-muted-foreground/70 mb-1">{hint}</div>
      <div className={`text-2xl font-semibold tabular-nums ${accentClass}`}>{value}</div>
    </Card>
  )
}
