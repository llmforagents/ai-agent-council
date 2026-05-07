import type { ReactNode } from 'react'
import { Topbar } from '@/presentation/components/Topbar'
import { LowBalanceBanner } from '@/presentation/components/LowBalanceBanner'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col text-foreground">
      <Topbar />
      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-6 space-y-4">
        <LowBalanceBanner />
        {children}
      </main>
    </div>
  )
}
