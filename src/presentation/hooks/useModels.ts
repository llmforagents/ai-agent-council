import { useQuery } from '@tanstack/react-query'
import { useActiveAgent } from './useActiveAgent'
import { useAppContainer } from './useAppContainer'
import type { ModelsResponse } from '@/application/ports'

export function useModels() {
  const agent = useActiveAgent()
  const { rest } = useAppContainer()
  return useQuery<ModelsResponse | null>({
    queryKey: ['models', agent?.id ?? 'none'],
    queryFn: async () => {
      if (!agent) return null
      const res = await rest.listModels(agent.apiKey)
      if (!res.ok) throw res.error
      return res.value
    },
    enabled: !!agent,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  })
}
