import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ theme, ...props }: ToasterProps) => {
  const resolvedTheme: NonNullable<ToasterProps["theme"]> = theme ?? "system"

  return (
    <Sonner
      theme={resolvedTheme}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",

          // success → emerald (same palette as deposit badges in /transactions)
          "--success-bg": "color-mix(in oklch, oklch(0.769 0.188 156) 14%, var(--popover))",
          "--success-text": "oklch(0.62 0.19 156)",
          "--success-border": "color-mix(in oklch, oklch(0.769 0.188 156) 28%, var(--border))",

          // info → neutral popover (slightly stronger border so it reads as notice)
          "--info-bg": "var(--popover)",
          "--info-text": "var(--popover-foreground)",
          "--info-border": "color-mix(in oklch, var(--foreground) 20%, var(--border))",

          // warning → amber (same palette as the mainnet banner)
          "--warning-bg": "color-mix(in oklch, oklch(0.8 0.18 82) 14%, var(--popover))",
          "--warning-text": "oklch(0.58 0.17 72)",
          "--warning-border": "color-mix(in oklch, oklch(0.8 0.18 82) 30%, var(--border))",

          // error → destructive theme tokens
          "--error-bg": "color-mix(in oklch, var(--destructive) 12%, var(--popover))",
          "--error-text": "var(--destructive)",
          "--error-border": "color-mix(in oklch, var(--destructive) 35%, var(--border))",

          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
