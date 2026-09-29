import { useLayoutEffect, useRef } from 'react'

const openDialogs: HTMLDialogElement[] = []
let lastActivationTarget: HTMLElement | null = null
let lastActivationAt = 0
let capturingActivations = false

function captureActivations() {
  if (capturingActivations) return
  capturingActivations = true
  const record = (event: Event) => {
    if (!(event.target instanceof Element)) return
    lastActivationTarget = event.target.closest<HTMLElement>('button, a, input, select, textarea, summary, [tabindex]')
    lastActivationAt = Date.now()
  }
  document.addEventListener('pointerdown', record, true)
  document.addEventListener('click', record, true)
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    const active = document.activeElement
    if (!(active instanceof HTMLElement)) return
    lastActivationTarget = active
    lastActivationAt = Date.now()
  }, true)
}

function isAvailable(element: HTMLElement | null): element is HTMLElement {
  return Boolean(element?.isConnected && element.getClientRects().length && !element.closest('[inert]'))
}

function focusInside(dialog: HTMLDialogElement) {
  const preferred = dialog.querySelector<HTMLElement>('[data-dialog-initial-focus]')
  if (isAvailable(preferred)) preferred.focus()
  else dialog.focus()
}

function keepTabInside(dialog: HTMLDialogElement, event: KeyboardEvent) {
  if (event.key !== 'Tab' || openDialogs.at(-1) !== dialog) return
  const focusedDialog = document.activeElement?.closest('dialog')
  if (focusedDialog && focusedDialog !== dialog && focusedDialog.matches(':modal')) return

  const controls = Array.from(dialog.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => isAvailable(element) && element.tabIndex >= 0)
  if (!controls.length) {
    event.preventDefault()
    dialog.focus()
    return
  }

  const first = controls[0]
  const last = controls[controls.length - 1]
  const active = document.activeElement
  if (event.shiftKey && (active === first || active === dialog || !dialog.contains(active))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (active === last || active === dialog || !dialog.contains(active))) {
    event.preventDefault()
    first.focus()
  }
}

/** Keeps native modal focus and restores the control that opened it. */
export function useNativeDialog(open = true) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const restoreFrameRef = useRef<number | null>(null)

  useLayoutEffect(() => {
    captureActivations()
    if (open && restoreFrameRef.current !== null) {
      window.cancelAnimationFrame(restoreFrameRef.current)
      restoreFrameRef.current = null
    }

    const dialog = dialogRef.current
    if (!open || !dialog) return

    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const recentActivation = Date.now() - lastActivationAt < 2000 && isAvailable(lastActivationTarget)
      ? lastActivationTarget
      : null
    const opener = recentActivation ?? activeElement
    if (!dialog.open) dialog.showModal()
    openDialogs.push(dialog)
    document.body.classList.add('app-native-dialog-open')
    focusInside(dialog)
    const handleKeyDown = (event: KeyboardEvent) => keepTabInside(dialog, event)
    document.addEventListener('keydown', handleKeyDown, true)

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      const index = openDialogs.lastIndexOf(dialog)
      if (index !== -1) openDialogs.splice(index, 1)
      if (dialog.open) dialog.close()
      if (!openDialogs.length) document.body.classList.remove('app-native-dialog-open')

      restoreFrameRef.current = window.requestAnimationFrame(() => {
        restoreFrameRef.current = null
        const remaining = openDialogs.at(-1)
        if (remaining?.open && (!opener || !remaining.contains(opener))) {
          focusInside(remaining)
          return
        }
        if (isAvailable(opener)) {
          opener.focus()
          return
        }
        if (remaining?.open) {
          focusInside(remaining)
          return
        }
        const activeNavigation = Array.from(document.querySelectorAll<HTMLElement>('.tabs [aria-current="page"], .liquid-tab-bar [aria-current="page"]'))
          .find(isAvailable)
        activeNavigation?.focus()
      })
    }
  }, [open])

  return dialogRef
}
