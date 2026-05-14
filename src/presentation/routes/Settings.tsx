import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useT } from '@/presentation/hooks/useT'
import { useAppStore } from '@/presentation/hooks/useAppStore'
import { useActiveAgent } from '@/presentation/hooks/useActiveAgent'
import { LOCALES, LOCALE_LABELS, type Locale } from '@/domain/i18n'
import { Card } from '@/presentation/components/ui/card'
import { Button } from '@/presentation/components/ui/button'
import { Input } from '@/presentation/components/ui/input'
import { safeCopy } from '@/lib/clipboard'

export function Settings() {
  const t = useT()
  const navigate = useNavigate()
  const agent = useActiveAgent()
  const setAgent = useAppStore((s) => s.setAgent)
  const renameAgent = useAppStore((s) => s.renameAgent)
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const locale = useAppStore((s) => s.locale)
  const setLocale = useAppStore((s) => s.setLocale)

  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState('')

  const handleChangeAgent = useCallback((): void => {
    if (!window.confirm(t('settings.changeAgentConfirm'))) return
    setAgent(null)
    void navigate('/onboarding')
  }, [t, setAgent, navigate])

  const handleCopy = useCallback((value: string) => {
    void safeCopy(value).then((r) => {
      if (r.ok) toast.success(t('common.copied'))
      else toast.error(t('common.copy'), { description: r.reason })
    })
  }, [t])

  const handleStartEdit = useCallback(() => {
    if (!agent) return
    setDraftName(agent.name)
    setEditing(true)
  }, [agent])

  const handleSaveName = useCallback(() => {
    const next = draftName.trim()
    if (!next) return
    renameAgent(next)
    setEditing(false)
    toast.success(t('settings.nameSaved'))
  }, [draftName, renameAgent, t])

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="text-center space-y-1">
        <h1 className="text-2xl sm:text-3xl font-bold">{t('settings.title')}</h1>
      </div>

      {agent ? (
        <Card className="p-6 flex flex-col items-center text-center gap-3 bg-gradient-to-br from-primary/10 to-transparent border-primary/20">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('settings.activeAgent')}
          </div>
          {editing ? (
            <div className="flex items-center gap-2 w-full max-w-xs">
              <Input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && draftName.trim()) handleSaveName()
                  if (e.key === 'Escape') setEditing(false)
                }}
                autoFocus
                className="text-center"
              />
              <Button size="sm" onClick={handleSaveName} disabled={!draftName.trim()}>
                {t('common.save')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                {t('common.cancel')}
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleStartEdit}
              className="text-2xl sm:text-3xl font-bold break-all hover:underline decoration-dotted underline-offset-4"
              title={t('settings.renameHint')}
            >
              {agent.name}
            </button>
          )}
          <button
            type="button"
            onClick={() => handleCopy(String(agent.id))}
            className="text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors break-all"
            title={t('common.copy')}
          >
            {String(agent.id)}
          </button>
          <div className="flex items-center gap-2 mt-2">
            <Button size="sm" variant="outline" onClick={handleChangeAgent}>
              {t('settings.changeAgent')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground max-w-md">
            {t('settings.changeAgentHint')}
          </p>
        </Card>
      ) : null}

      <Card className="p-6 space-y-5">
        <div className="text-center">
          <h2 className="text-lg font-semibold">{t('settings.appearance')}</h2>
        </div>

        <div className="mx-auto max-w-xl grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5 text-center">
              {t('settings.theme')}
            </label>
            <Segmented
              options={[
                { value: 'light', label: t('settings.themeLight') },
                { value: 'dark', label: t('settings.themeDark') },
              ]}
              value={theme}
              onChange={(v) => setTheme(v === 'light' ? 'light' : 'dark')}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5 text-center">
              {t('settings.language')}
            </label>
            <Segmented
              options={LOCALES.map((l: Locale) => ({ value: l, label: LOCALE_LABELS[l] }))}
              value={locale}
              onChange={(v) => setLocale(v as Locale)}
            />
          </div>
        </div>
      </Card>
    </div>
  )
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ value: string; label: string }>
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div
      className="grid gap-1 rounded-lg border border-border bg-muted/30 p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`py-1.5 text-sm rounded-md transition-colors ${
            o.value === value
              ? 'bg-foreground/15 text-foreground shadow-sm font-medium ring-1 ring-foreground/10'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
