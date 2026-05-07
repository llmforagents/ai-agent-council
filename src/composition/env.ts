import { z } from 'zod'

const EnvSchema = z.object({
  VITE_API_BASE: z.string().min(1),
})

export type AppEnv = Readonly<{ apiBase: string }>

export function loadEnv(raw: Readonly<Record<string, string | undefined>>): AppEnv {
  const parsed = EnvSchema.safeParse(raw)
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid environment:\n${errors}`)
  }
  return { apiBase: parsed.data.VITE_API_BASE }
}
