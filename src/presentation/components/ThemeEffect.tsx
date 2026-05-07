import { useEffect } from 'react'
import { useAppStore } from '@/presentation/hooks/useAppStore'

/**
 * Applies the persisted theme to <html> on every change.
 * Mounted at the Providers level so it runs on every route, including
 * /onboarding which has no AppShell.
 */
export function ThemeEffect() {
  const theme = useAppStore((s) => s.theme)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])
  return null
}
