import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SearchIcon, XIcon } from 'lucide-react'
import { DEFAULT_MODEL } from '@/domain/defaults'
import type { ModelInfo } from '@/application/ports'

type Props = Readonly<{
  models: readonly ModelInfo[]
  value: string
  onChange: (slug: string) => void
}>

function fmtPrice(p: number): string {
  if (!Number.isFinite(p) || p < 0) return 'variable'
  return `$${p.toFixed(2)}`
}

export function ModelPicker({ models, value, onChange }: Props) {
  const defaultModel = useMemo(() => models.find((m) => m.slug === DEFAULT_MODEL), [models])
  const selected = useMemo(() => models.find((m) => m.slug === value), [models, value])
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [confirmPending, setConfirmPending] = useState<string | null>(null)
  // Dropdown is rendered via a portal to document.body with position:fixed
  // because the ModelPicker lives inside cards with `overflow-hidden` that
  // would otherwise clip the dropdown. We compute viewport coordinates
  // (left/top OR bottom + width) from the input's getBoundingClientRect on
  // every open/resize/scroll. Coordinates are clamped to the viewport so the
  // list never extends past the screen edges.
  type DropdownPos = Readonly<{
    left: number
    width: number
    /** Either `top` (open downward) or `bottom` (open upward). */
    top?: number
    bottom?: number
    maxHeight: number
  }>
  const [dropdownPos, setDropdownPos] = useState<DropdownPos | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const inputWrapperRef = useRef<HTMLDivElement | null>(null)
  const dropdownRef = useRef<HTMLDivElement | null>(null)

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return []
    return models
      .filter((m) =>
        m.slug.toLowerCase().includes(term) ||
        m.displayName.toLowerCase().includes(term) ||
        (m.provider?.toLowerCase().includes(term) ?? false)
      )
      .slice(0, 50)
  }, [models, search])

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent): void => {
      // The dropdown is rendered in a portal so it's not a child of rootRef.
      // Treat clicks inside either the root OR the portaled dropdown as inside.
      const target = e.target as Node
      const insideRoot = rootRef.current?.contains(target) ?? false
      const insideDropdown = dropdownRef.current?.contains(target) ?? false
      if (!insideRoot && !insideDropdown) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  // Re-compute portal coordinates on open, search changes (filtered count),
  // resize, and ANY scroll (capture phase catches scrolling ancestors too).
  useEffect(() => {
    if (!open || !inputWrapperRef.current) {
      setDropdownPos(null)
      return
    }
    const MARGIN = 12
    const IDEAL_HEIGHT = 320
    const compute = (): void => {
      const el = inputWrapperRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom - MARGIN
      const spaceAbove = rect.top - MARGIN
      const flip = spaceBelow < IDEAL_HEIGHT && spaceAbove > spaceBelow
      const available = Math.max(80, flip ? spaceAbove : spaceBelow)
      const maxHeight = Math.min(IDEAL_HEIGHT, available)
      const base: { left: number; width: number; maxHeight: number } = {
        left: rect.left,
        width: rect.width,
        maxHeight,
      }
      setDropdownPos(
        flip
          ? { ...base, bottom: window.innerHeight - rect.top + 4 }
          : { ...base, top: rect.bottom + 4 },
      )
    }
    compute()
    window.addEventListener('resize', compute)
    window.addEventListener('scroll', compute, true)
    return () => {
      window.removeEventListener('resize', compute)
      window.removeEventListener('scroll', compute, true)
    }
  }, [open, search])

  const attemptChange = (nextSlug: string): void => {
    setOpen(false)
    setSearch('')
    if (nextSlug === value) return
    const next = models.find((m) => m.slug === nextSlug)
    if (!next || !defaultModel) { onChange(nextSlug); return }
    const nextPrice = Math.max(0, next.inputPricePer1M) + Math.max(0, next.outputPricePer1M)
    const defaultPrice = Math.max(0, defaultModel.inputPricePer1M) + Math.max(0, defaultModel.outputPricePer1M)
    if (nextPrice > defaultPrice) {
      setConfirmPending(nextSlug)
    } else {
      onChange(nextSlug)
    }
  }

  const selectedLabel = selected?.displayName ?? value ?? '—'
  const isDefault = value === DEFAULT_MODEL
  const showDropdown = open && search.trim().length > 0

  return (
    <>
      <div ref={rootRef} className="flex items-center gap-3 flex-wrap flex-1 min-w-0 relative">
        <div className="flex items-center gap-2 w-[18rem] flex-shrink-0">
          <span className="font-medium truncate text-sm flex-1 min-w-0" title={selected?.slug ?? value}>
            {selectedLabel}
          </span>
          {isDefault && selected ? (
            <span className="text-[10px] rounded-md bg-emerald-500/15 text-emerald-600 px-1.5 py-0.5 flex-shrink-0">default</span>
          ) : null}
        </div>

        <div ref={inputWrapperRef} className="relative flex-1 min-w-[14rem]">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            placeholder={`Filter ${models.length} models…`}
            className="w-full h-9 rounded-lg border border-border bg-background pl-8 pr-8 text-sm outline-none focus:ring-3 focus:ring-ring/50"
          />
          {search ? (
            <button
              type="button"
              onClick={() => { setSearch(''); setOpen(false) }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear filter"
            >
              <XIcon className="size-4" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Portal-rendered dropdown — bypasses any ancestor overflow:hidden. */}
      {showDropdown && dropdownPos
        ? createPortal(
            <div
              ref={dropdownRef}
              className="fixed z-50 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg overflow-hidden"
              style={{
                left: `${dropdownPos.left}px`,
                width: `${dropdownPos.width}px`,
                ...(dropdownPos.top !== undefined ? { top: `${dropdownPos.top}px` } : {}),
                ...(dropdownPos.bottom !== undefined ? { bottom: `${dropdownPos.bottom}px` } : {}),
              }}
            >
              <ul className="overflow-auto py-1" style={{ maxHeight: `${dropdownPos.maxHeight}px` }}>
                {filtered.length === 0 ? (
                  <li className="px-3 py-4 text-sm text-muted-foreground text-center">
                    No models match &ldquo;{search}&rdquo;
                  </li>
                ) : null}
                {filtered.map((m) => {
                  const isActive = m.slug === value
                  const isDefaultItem = m.slug === DEFAULT_MODEL
                  return (
                    <li key={m.slug}>
                      <button
                        type="button"
                        onClick={() => attemptChange(m.slug)}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors ${isActive ? 'bg-accent/60' : ''}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate flex-1 min-w-0">{m.displayName}</span>
                          {isDefaultItem ? <span className="text-[10px] rounded-md bg-emerald-500/15 text-emerald-600 px-1.5 py-0.5 flex-shrink-0">default</span> : null}
                          {isActive ? <span className="text-[10px] rounded-md bg-primary/15 text-primary px-1.5 py-0.5 flex-shrink-0">selected</span> : null}
                        </div>
                        <div className="text-xs text-muted-foreground truncate mt-0.5">
                          {m.slug} · in {fmtPrice(m.inputPricePer1M)}/1M · out {fmtPrice(m.outputPricePer1M)}/1M
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
              {filtered.length === 50 ? (
                <div className="px-3 py-1.5 text-[11px] text-muted-foreground border-t border-border bg-muted/20">
                  Showing first 50 · refine your search
                </div>
              ) : null}
            </div>,
            document.body,
          )
        : null}

      {confirmPending ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-background border border-border rounded-xl p-6 max-w-md shadow-xl">
            <h3 className="font-semibold text-base mb-2">Confirm more expensive model</h3>
            <p className="text-sm text-muted-foreground mb-4">
              You are switching from <b className="text-foreground">{DEFAULT_MODEL}</b> to <b className="text-foreground">{confirmPending}</b>, which costs more per token.
              Calls against this model will spend more real money.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmPending(null)} className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted/50 transition-colors">Cancel</button>
              <button
                onClick={() => { onChange(confirmPending); setConfirmPending(null) }}
                className="px-3 py-1.5 text-sm rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
