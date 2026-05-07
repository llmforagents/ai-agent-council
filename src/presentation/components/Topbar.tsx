import { Link, useLocation } from 'react-router-dom'
import { Sun, Moon, RefreshCw } from 'lucide-react'
import { useT } from '@/presentation/hooks/useT'
import { useAppStore } from '@/presentation/hooks/useAppStore'
import { useActiveAgent } from '@/presentation/hooks/useActiveAgent'
import { useBalance } from '@/presentation/hooks/useBalance'
import { useQueryClient } from '@tanstack/react-query'
import { LOCALES } from '@/domain/i18n'

export function Topbar() {
  const t = useT()
  const agent = useActiveAgent()
  const theme = useAppStore((s) => s.theme)
  const toggleTheme = useAppStore((s) => s.toggleTheme)
  const locale = useAppStore((s) => s.locale)
  const setLocale = useAppStore((s) => s.setLocale)
  const balance = useBalance()
  const qc = useQueryClient()
  const loc = useLocation()

  const balanceUsd = balance.data
    ? `$${(balance.data.availableUsdCents / 100).toFixed(2)}`
    : '—'

  return (
    <header className="border-b border-border bg-background/95 backdrop-blur sticky top-0 z-30">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        {/* Brand */}
        <Link to="/" className="font-bold text-lg whitespace-nowrap order-1 flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block size-2 rounded-full animate-pulse"
            style={{ backgroundColor: '#06b6d4', boxShadow: '0 0 8px #06b6d4' }}
          />
          {t('app.title')}
        </Link>

        {/* Nav */}
        <nav className="flex items-center gap-1 order-3 lg:order-2 w-full lg:w-auto justify-center lg:justify-start overflow-x-auto">
          {agent ? (
            <>
              <NavLink to="/council" current={loc.pathname.startsWith('/council')}>
                {t('topbar.council')}
              </NavLink>
              <NavLink to="/wallet" current={loc.pathname.startsWith('/wallet')}>
                {t('topbar.wallet')}
              </NavLink>
              <NavLink to="/transactions" current={loc.pathname.startsWith('/transactions')}>
                {t('topbar.transactions')}
              </NavLink>
              <NavLink to="/settings" current={loc.pathname.startsWith('/settings')}>
                {t('topbar.settings')}
              </NavLink>
            </>
          ) : null}
        </nav>

        {/* Utils */}
        <div className="flex items-center justify-end gap-3 order-2 lg:order-3 flex-wrap">
          {agent ? (
            <div className="flex items-center gap-1 text-sm">
              <span className="text-muted-foreground">{t('topbar.balance')}</span>
              <span className="font-mono font-semibold">{balanceUsd}</span>
              <button
                type="button"
                onClick={() => qc.invalidateQueries({ queryKey: ['balance', agent.id] })}
                className="p-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                aria-label={t('topbar.refresh')}
                title={t('topbar.refresh')}
                disabled={balance.isFetching}
              >
                <RefreshCw className={`size-3.5 ${balance.isFetching ? 'animate-spin' : ''}`} />
              </button>
            </div>
          ) : null}
          <div className="flex items-center gap-1 border border-border rounded-md p-0.5 text-xs">
            {LOCALES.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLocale(l)}
                className={`px-2 py-0.5 rounded transition-colors ${l === locale ? 'bg-foreground/15 font-semibold' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            aria-label={theme === 'dark' ? t('topbar.switchToLight') : t('topbar.switchToDark')}
            title={theme === 'dark' ? t('topbar.switchToLight') : t('topbar.switchToDark')}
          >
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
        </div>
      </div>
    </header>
  )
}

function NavLink({ to, current, children }: { to: string; current: boolean; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className={`px-3 py-1.5 rounded-md text-sm font-bold transition-colors ${current ? 'bg-foreground/10 text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
    >
      {children}
    </Link>
  )
}
