import { useQuery } from '@tanstack/react-query'
import { useActiveAgent } from './useActiveAgent'
import { useAppContainer } from './useAppContainer'
import type { BalanceResponse } from '@/application/ports'

export function useBalance() {
  const agent = useActiveAgent()
  const { rest } = useAppContainer()
  return useQuery<BalanceResponse | null>({
    queryKey: ['balance', agent?.id ?? 'none'],
    queryFn: async () => {
      if (!agent) return null
      const res = await rest.getBalance(agent.apiKey)
      if (!res.ok) throw res.error
      return res.value
    },
    enabled: !!agent,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}
