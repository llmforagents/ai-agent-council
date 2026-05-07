import { useQuery } from '@tanstack/react-query'
import { useAppContainer } from './useAppContainer'
import { useActiveAgent } from './useActiveAgent'
import type { TransactionType } from '@/application/ports'

export function useTransactions(params: {
  type?: TransactionType
  limit?: number
  offset?: number
} = {}) {
  const { rest } = useAppContainer()
  const agent = useActiveAgent()
  return useQuery({
    queryKey: ['transactions', agent?.id, params],
    enabled: !!agent,
    queryFn: async () => {
      if (!agent) throw new Error('no agent')
      const res = await rest.listTransactions(agent.apiKey, params)
      if (!res.ok) throw res.error
      return res.value
    },
  })
}
