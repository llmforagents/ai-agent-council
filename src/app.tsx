import { Routes, Route, Navigate } from 'react-router-dom'
import { Providers } from '@/presentation/layout/Providers'
import { AppShell } from '@/presentation/layout/AppShell'
import { Council } from '@/presentation/routes/Council'
import { Onboarding } from '@/presentation/routes/Onboarding'
import { Settings } from '@/presentation/routes/Settings'
import { Wallet } from '@/presentation/routes/Wallet'
import { Transactions } from '@/presentation/routes/Transactions'
import { useActiveAgent } from '@/presentation/hooks/useActiveAgent'
import type { ReactNode } from 'react'

export function App() {
  return (
    <Providers>
      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route
          path="/council"
          element={
            <RequireAgent>
              <AppShell><Council /></AppShell>
            </RequireAgent>
          }
        />
        <Route
          path="/wallet"
          element={
            <RequireAgent>
              <AppShell><Wallet /></AppShell>
            </RequireAgent>
          }
        />
        <Route
          path="/transactions"
          element={
            <RequireAgent>
              <AppShell><Transactions /></AppShell>
            </RequireAgent>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAgent>
              <AppShell><Settings /></AppShell>
            </RequireAgent>
          }
        />
        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Providers>
  )
}

function RequireAgent({ children }: { children: ReactNode }) {
  const agent = useActiveAgent()
  if (!agent) return <Navigate to="/onboarding" replace />
  return <>{children}</>
}

function RootRedirect() {
  const agent = useActiveAgent()
  return <Navigate to={agent ? '/council' : '/onboarding'} replace />
}
