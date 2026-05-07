import { Link, useLocation } from 'react-router-dom'
import { useT } from '@/presentation/hooks/useT'
import { useBalance } from '@/presentation/hooks/useBalance'

const LOW_THRESHOLD_CENTS = 20

export function LowBalanceBanner() {
  const t = useT()
  const balance = useBalance()
  const loc = useLocation()
  // The wallet route is the place users land to top up — don't double-message.
  if (loc.pathname.startsWith('/wallet')) return null
  if (!balance.data) return null
  const cents = balance.data.availableUsdCents
  if (cents > LOW_THRESHOLD_CENTS) return null
  const isZero = cents === 0
  return (
    <div className={`rounded-lg border px-4 py-2 text-xs flex items-center gap-3 ${isZero ? 'border-destructive bg-destructive/10 text-destructive' : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'}`}>
      <span className="font-medium">{isZero ? t('wallet.zeroBalance') : t('wallet.lowBalance')}</span>
      <Link to="/wallet" className="underline ml-auto font-semibold">
        {t('topbar.wallet')} →
      </Link>
    </div>
  )
}
