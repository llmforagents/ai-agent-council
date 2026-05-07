import { useMemo, type ReactNode } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from '@/presentation/components/ui/sonner'
import { ThemeEffect } from '@/presentation/components/ThemeEffect'
import { AppContainerContext } from '@/presentation/hooks/useAppContainer'
import { composeApp } from '@/composition/root'

export function Providers({ children }: { children: ReactNode }) {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: (count, err) => {
              const kind = (err as { kind?: string } | null)?.kind
              if (kind === 'unauthorized' || kind === 'rate_limited' || kind === 'validation') return false
              return count < 2
            },
            refetchOnWindowFocus: false,
            staleTime: 30_000,
          },
        },
      }),
    [],
  )
  const container = useMemo(
    () => composeApp({ apiBase: import.meta.env['VITE_API_BASE'] ?? 'https://api.llm4agents.com' }),
    [],
  )

  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AppContainerContext.Provider value={container}>
          <ThemeEffect />
          {children}
          <Toaster position="bottom-right" richColors />
        </AppContainerContext.Provider>
      </QueryClientProvider>
    </BrowserRouter>
  )
}
