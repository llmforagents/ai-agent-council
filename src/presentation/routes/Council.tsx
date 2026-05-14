import { useState } from 'react'
import { toast } from 'sonner'
import { CopyIcon, PlusIcon } from 'lucide-react'
import { useT } from '@/presentation/hooks/useT'
import { useCouncilStream } from '@/presentation/hooks/useCouncilStream'
import { useActiveAgent } from '@/presentation/hooks/useActiveAgent'
import { CouncilSetup } from '@/presentation/components/council/CouncilSetup'
import { CouncilStream } from '@/presentation/components/council/CouncilStream'
import { CouncilHistory } from '@/presentation/components/council/CouncilHistory'
import { Card } from '@/presentation/components/ui/card'
import { Button } from '@/presentation/components/ui/button'
import { safeCopy } from '@/lib/clipboard'

export function Council() {
  const t = useT()
  const agent = useActiveAgent()
  const { state, runs, start, selectRun, closeRun, deleteRun, clearHistory } = useCouncilStream()

  const [taskCopied, setTaskCopied] = useState(false)

  const handleCopyTask = async (): Promise<void> => {
    if (!state.activeTask) return
    const res = await safeCopy(state.activeTask)
    if (res.ok) {
      setTaskCopied(true)
      toast.success(t('common.copied'))
      setTimeout(() => setTaskCopied(false), 1500)
    } else {
      toast.error(t('common.copy'), { description: res.reason })
    }
  }

  if (!agent) {
    return (
      <div className="mx-auto max-w-4xl">
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No active agent.
        </Card>
      </div>
    )
  }

  const showSetup = !state.isRunning && state.events.length === 0
  const showRun = state.isRunning || state.events.length > 0

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Card className="p-6 flex flex-col items-center text-center gap-2 bg-gradient-to-br from-primary/10 to-transparent border-primary/20">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {t('settings.activeAgent')}
        </div>
        <div className="text-xl sm:text-2xl font-bold break-all">{agent.name}</div>
        <h1 className="text-2xl sm:text-3xl font-bold mt-1">{t('council.title')}</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">{t('council.subtitle')}</p>
      </Card>

      {showSetup ? (
        <Card className="p-6">
          <CouncilSetup disabled={false} onStart={start} />
        </Card>
      ) : null}

      {showRun ? (
        <>
          {state.activeTimestamp && !state.isRunning ? (
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground flex flex-wrap items-center gap-2">
              <span>📌 {t('council.lastRun')}</span>
              <span className="font-mono">
                {new Date(state.activeTimestamp).toLocaleString()}
              </span>
              {state.activePlan ? (
                <span className="rounded-md bg-foreground/10 px-1.5 py-0.5 font-medium">
                  {state.activePlan}
                </span>
              ) : null}
              {state.activeTask ? (
                <>
                  <span className="truncate flex-1 min-w-0" title={state.activeTask}>
                    · {state.activeTask}
                  </span>
                  <button
                    type="button"
                    onClick={() => { void handleCopyTask() }}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-foreground/10 transition-colors flex-shrink-0"
                    aria-label={t('common.copy')}
                    title={t('common.copy')}
                  >
                    <CopyIcon className="size-3" aria-hidden="true" />
                    <span>{taskCopied ? t('common.copied') : t('common.copy')}</span>
                  </button>
                </>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                onClick={closeRun}
                className="ml-auto flex-shrink-0 h-7"
              >
                <PlusIcon className="size-3 mr-1" aria-hidden="true" />
                {t('council.newRun')}
              </Button>
            </div>
          ) : null}

          <CouncilStream events={state.events} isRunning={state.isRunning} />
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Button onClick={closeRun} disabled={state.isRunning}>
              {t('council.newRun')}
            </Button>
            {state.totalCostCents > 0 ? (
              <span className="text-xs text-muted-foreground">
                {t('council.totalCost', { cost: (state.totalCostCents / 100).toFixed(4) })}
              </span>
            ) : null}
          </div>
        </>
      ) : null}

      {state.error ? (
        <Card className="p-4 border-destructive">
          <div className="text-sm text-destructive">{state.error}</div>
        </Card>
      ) : null}

      <CouncilHistory
        runs={runs}
        activeRunId={state.activeRunId}
        onSelect={selectRun}
        onDelete={deleteRun}
        onClearAll={clearHistory}
      />
    </div>
  )
}
