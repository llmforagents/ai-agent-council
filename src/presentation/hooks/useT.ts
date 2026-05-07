import { useCallback } from 'react'
import { translate, type MessageKey } from '@/domain/i18n'
import { useAppStore } from './useAppStore'

export function useT(): (key: MessageKey, vars?: Record<string, string | number>) => string {
  const locale = useAppStore((s) => s.locale)
  return useCallback((key, vars) => translate(locale, key, vars), [locale])
}
