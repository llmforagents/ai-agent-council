import { useNavigate } from 'react-router-dom'
import { useT } from '@/presentation/hooks/useT'
import { useAppStore } from '@/presentation/hooks/useAppStore'
import { useActiveAgent } from '@/presentation/hooks/useActiveAgent'
import { LOCALES, type Locale } from '@/domain/i18n'
import { Card } from '@/presentation/components/ui/card'
import { Button } from '@/presentation/components/ui/button'

export function Settings() {
  const t = useT()
  const navigate = useNavigate()
  const agent = useActiveAgent()
  const setAgent = useAppStore((s) => s.setAgent)
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const locale = useAppStore((s) => s.locale)
  const setLocale = useAppStore((s) => s.setLocale)

  const handleChangeAgent = (): void => {
    if (!window.confirm(t('settings.changeAgentConfirm'))) return
    setAgent(null)
    void navigate('/onboarding')
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">{t('settings.title')}</h1>

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">{t('settings.appearance')}</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground w-24">{t('settings.theme')}</span>
          <div className="flex gap-1 border border-border rounded-md p-0.5">
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`px-3 py-1 rounded text-sm ${theme === 'light' ? 'bg-foreground/15 font-semibold' : 'text-muted-foreground'}`}
            >
              {t('settings.themeLight')}
            </button>
            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={`px-3 py-1 rounded text-sm ${theme === 'dark' ? 'bg-foreground/15 font-semibold' : 'text-muted-foreground'}`}
            >
              {t('settings.themeDark')}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground w-24">{t('settings.language')}</span>
          <div className="flex gap-1 border border-border rounded-md p-0.5">
            {LOCALES.map((l: Locale) => (
              <button
                key={l}
                type="button"
                onClick={() => setLocale(l)}
                className={`px-3 py-1 rounded text-sm ${l === locale ? 'bg-foreground/15 font-semibold' : 'text-muted-foreground'}`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {agent ? (
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-semibold">{t('settings.account')}</h2>
          <div className="space-y-1.5">
            <div className="text-xs text-muted-foreground">{t('settings.activeAgent')}</div>
            <div className="font-mono font-semibold">{agent.name}</div>
            <div className="text-[10px] font-mono text-muted-foreground">{String(agent.id)}</div>
          </div>
          <div className="pt-2 space-y-2">
            <Button variant="outline" onClick={handleChangeAgent}>
              {t('settings.changeAgent')}
            </Button>
            <p className="text-xs text-muted-foreground">{t('settings.changeAgentHint')}</p>
          </div>
        </Card>
      ) : null}
    </div>
  )
}
