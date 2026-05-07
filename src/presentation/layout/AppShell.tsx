import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { Topbar } from '@/presentation/components/Topbar'
import { LowBalanceBanner } from '@/presentation/components/LowBalanceBanner'
import { useAppStore } from '@/presentation/hooks/useAppStore'

export function AppShell({ children }: { children: ReactNode }) {
  const theme = useAppStore((s) => s.theme)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Topbar />
      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-6 space-y-4">
        <LowBalanceBanner />
        {children}
      </main>
    </div>
  )
}
