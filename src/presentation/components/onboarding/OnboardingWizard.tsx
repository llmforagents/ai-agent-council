import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useT } from '@/presentation/hooks/useT'
import { useAppContainer } from '@/presentation/hooks/useAppContainer'
import { useAppStore } from '@/presentation/hooks/useAppStore'
import { ApiKey, AgentId } from '@/domain/branded'
import { Card } from '@/presentation/components/ui/card'
import { Button } from '@/presentation/components/ui/button'
import { Input } from '@/presentation/components/ui/input'
import { Label } from '@/presentation/components/ui/label'

type Step = 'welcome' | 'has-agent' | 'enter-key' | 'register' | 'fund'

export function OnboardingWizard() {
  const t = useT()
  const [step, setStep] = useState<Step>('welcome')

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 space-y-6">
      {step === 'welcome' && (
        <Card className="p-8 text-center space-y-5">
          <h1 className="text-3xl font-bold">{t('onb.welcome.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('onb.welcome.body')}</p>
          <div className="flex justify-center pt-2">
            <Button size="lg" onClick={() => setStep('has-agent')}>{t('common.next')}</Button>
          </div>
        </Card>
      )}

      {step === 'has-agent' && (
        <Card className="p-8 space-y-5">
          <h2 className="text-xl font-bold text-center">{t('onb.hasAgent.title')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <Button size="lg" onClick={() => setStep('enter-key')}>{t('onb.hasAgent.yes')}</Button>
            <Button size="lg" variant="outline" onClick={() => setStep('register')}>{t('onb.hasAgent.no')}</Button>
          </div>
          <div className="flex justify-center pt-3">
            <button onClick={() => setStep('welcome')} className="text-xs text-muted-foreground hover:underline">{t('common.back')}</button>
          </div>
        </Card>
      )}

      {step === 'enter-key' && <KeyEntry onValid={() => setStep('fund')} onBack={() => setStep('has-agent')} />}
      {step === 'register' && <RegisterAgent onCreated={() => setStep('fund')} onBack={() => setStep('has-agent')} />}
      {step === 'fund' && <FundingGuide />}
    </div>
  )
}

function KeyEntry({ onValid, onBack }: { onValid: () => void; onBack: () => void }) {
  const t = useT()
  const { rest } = useAppContainer()
  const setAgent = useAppStore((s) => s.setAgent)
  const [keyInput, setKeyInput] = useState('')
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleValidate = useCallback(async () => {
    const trimmed = keyInput.trim()
    if (!trimmed) return
    setValidating(true)
    setError(null)
    try {
      const apiKey = ApiKey(trimmed)
      const res = await rest.getBalance(apiKey)
      if (!res.ok) {
        if (res.error.kind === 'unauthorized') setError(t('onb.key.invalid'))
        else if (res.error.kind === 'network') setError(t('onb.key.errNetwork'))
        else setError(t('err.unknown'))
        return
      }
      // Key works. We don't have agent metadata from /balance directly;
      // synthesise a placeholder Agent record (id = synthetic UUID) and let
      // the Settings page surface the actual data the user already knows.
      const placeholderId = AgentId(syntheticUuid())
      setAgent({
        id: placeholderId,
        name: 'Imported agent',
        apiKey,
        createdAt: new Date(),
      })
      toast.success(t('onb.key.validate'))
      onValid()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setValidating(false)
    }
  }, [keyInput, rest, setAgent, t, onValid])

  return (
    <Card className="p-6 sm:p-8 space-y-4">
      <h2 className="text-xl font-bold">{t('onb.key.title')}</h2>
      <p className="text-sm text-muted-foreground">{t('onb.key.body')}</p>
      <div className="space-y-2">
        <Label htmlFor="onb-key">API key</Label>
        <Input
          id="onb-key"
          type="password"
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          placeholder={t('onb.key.placeholder')}
          spellCheck={false}
          autoFocus
          disabled={validating}
        />
      </div>
      {error ? <div className="text-xs text-destructive">{error}</div> : null}
      <div className="flex items-center justify-between pt-2">
        <button onClick={onBack} className="text-xs text-muted-foreground hover:underline">{t('common.back')}</button>
        <Button onClick={handleValidate} disabled={!keyInput.trim() || validating}>
          {validating ? t('onb.key.validating') : t('onb.key.validate')}
        </Button>
      </div>
    </Card>
  )
}

function RegisterAgent({ onCreated, onBack }: { onCreated: () => void; onBack: () => void }) {
  const t = useT()
  const { rest } = useAppContainer()
  const setAgent = useAppStore((s) => s.setAgent)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = useCallback(async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setCreating(true)
    setError(null)
    try {
      const res = await rest.registerAgent({ name: trimmed })
      if (!res.ok) {
        setError(t('onb.register.failed'))
        return
      }
      setAgent({
        id: AgentId(res.value.uuid),
        name: res.value.name,
        apiKey: ApiKey(res.value.apiKey),
        createdAt: new Date(res.value.createdAt),
      })
      toast.success(t('onb.register.cta'))
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }, [name, rest, setAgent, t, onCreated])

  return (
    <Card className="p-6 sm:p-8 space-y-4">
      <h2 className="text-xl font-bold">{t('onb.register.title')}</h2>
      <p className="text-sm text-muted-foreground">{t('onb.register.body')}</p>
      <div className="space-y-2">
        <Label htmlFor="onb-name">{t('settings.activeAgent')}</Label>
        <Input
          id="onb-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('onb.register.namePlaceholder')}
          autoFocus
          disabled={creating}
          onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) void handleCreate() }}
        />
      </div>
      {error ? <div className="text-xs text-destructive">{error}</div> : null}
      <div className="flex items-center justify-between pt-2">
        <button onClick={onBack} className="text-xs text-muted-foreground hover:underline">{t('common.back')}</button>
        <Button onClick={handleCreate} disabled={!name.trim() || creating}>
          {creating ? t('onb.register.creating') : t('onb.register.cta')}
        </Button>
      </div>
    </Card>
  )
}

function FundingGuide() {
  const t = useT()
  const { rest } = useAppContainer()
  const navigate = useNavigate()
  const agent = useAppStore((s) => s.agent)
  const [generating, setGenerating] = useState(false)
  const [address, setAddress] = useState<string | null>(null)
  const [balanceCents, setBalanceCents] = useState<number | null>(null)

  const handleGenerate = useCallback(async () => {
    if (!agent) return
    setGenerating(true)
    try {
      const res = await rest.generateWallet(agent.apiKey, { chain: 'solana', token: 'USDC' })
      if (res.ok) {
        setAddress(res.value.address)
        toast.success('Address ready')
      } else {
        toast.error(t('err.unknown'))
      }
    } finally {
      setGenerating(false)
    }
  }, [agent, rest, t])

  const handleRefreshBalance = useCallback(async () => {
    if (!agent) return
    const r = await rest.getBalance(agent.apiKey)
    if (r.ok) setBalanceCents(r.value.availableUsdCents)
  }, [agent, rest])

  const handleCopy = useCallback((text: string) => {
    void navigator.clipboard.writeText(text)
    toast.success(t('common.copied'))
  }, [t])

  return (
    <Card className="p-6 sm:p-8 space-y-4">
      <h2 className="text-xl font-bold">{t('onb.fund.title')}</h2>
      <p className="text-sm text-muted-foreground">{t('onb.fund.body')}</p>

      {!address ? (
        <Button onClick={handleGenerate} disabled={generating} className="w-full">
          {generating ? t('onb.fund.generating') : t('onb.fund.generate')}
        </Button>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground mb-1.5">Solana · USDC</div>
            <div className="flex items-center gap-2">
              <code className="font-mono text-sm break-all flex-1">{address}</code>
              <Button size="sm" variant="outline" onClick={() => handleCopy(address)}>
                {t('common.copy')}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t('onb.fund.minimumHint')}</p>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <span className="text-xs text-muted-foreground">{t('onb.fund.balanceLabel')}:</span>
        <span className="font-mono font-semibold text-sm">
          {balanceCents !== null ? `$${(balanceCents / 100).toFixed(2)}` : '—'}
        </span>
        <Button size="sm" variant="outline" onClick={handleRefreshBalance} className="ml-2">
          {t('common.refresh')}
        </Button>
      </div>

      <div className="flex items-center justify-between pt-3">
        <Button variant="ghost" onClick={() => navigate('/council')}>
          {t('onb.fund.continueAnyway')}
        </Button>
        <Button onClick={() => navigate('/council')} disabled={balanceCents === 0 || balanceCents === null}>
          {t('onb.fund.continueWith')} →
        </Button>
      </div>
    </Card>
  )
}

function syntheticUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return '00000000-0000-4000-8000-000000000000'
}
