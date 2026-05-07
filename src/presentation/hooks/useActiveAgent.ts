import { useAppStore } from './useAppStore'
import type { Agent } from '@/domain/agent'

export function useActiveAgent(): Agent | null {
  return useAppStore((s) => s.agent)
}
