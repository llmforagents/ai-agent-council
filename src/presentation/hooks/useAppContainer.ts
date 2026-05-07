import { createContext, useContext } from 'react'
import type { AppContainer } from '@/composition/root'

export const AppContainerContext = createContext<AppContainer | null>(null)

export function useAppContainer(): AppContainer {
  const ctx = useContext(AppContainerContext)
  if (!ctx) throw new Error('AppContainer not provided')
  return ctx
}
