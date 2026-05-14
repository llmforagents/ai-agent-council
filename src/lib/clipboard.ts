/**
 * Copy text to the clipboard with a graceful fallback for non-secure contexts.
 *
 * The async Clipboard API (`navigator.clipboard.writeText`) is only available in
 * secure contexts (HTTPS or `localhost`). When the app is opened via a LAN
 * hostname over plain HTTP (e.g. `http://skywalker:4302/`), `navigator.clipboard`
 * is `undefined`. We fall back to the legacy `document.execCommand('copy')`
 * approach via a hidden textarea, which works in every current browser.
 */
export type CopyResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string }

export async function safeCopy(text: string): Promise<CopyResult> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return { ok: true }
    } catch (err) {
      // Fall through to the legacy path below — some browsers permission-deny
      // even though the API is present.
      void err
    }
  }
  if (typeof document === 'undefined') {
    return { ok: false, reason: 'clipboard not available' }
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '0'
    ta.style.left = '0'
    ta.style.opacity = '0'
    ta.style.pointerEvents = 'none'
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, ta.value.length)
    const succeeded = document.execCommand('copy')
    document.body.removeChild(ta)
    if (succeeded) return { ok: true }
    return { ok: false, reason: 'execCommand copy returned false' }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    return { ok: false, reason }
  }
}
