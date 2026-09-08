let selectionObserver: MutationObserver | null = null
let rootObserver: MutationObserver | null = null

function rewriteSelectionCount(element: HTMLElement) {
  const text = element.textContent?.trim() ?? ''
  const match = text.match(/^선택\s*(\d+)회$/)
  if (!match) return
  element.textContent = `총 ${match[1]}개 선택`
}

function bindSelectionCount() {
  const element = document.querySelector<HTMLElement>('.selection-count')
  if (!element) return false

  rewriteSelectionCount(element)
  selectionObserver?.disconnect()
  selectionObserver = new MutationObserver(() => rewriteSelectionCount(element))
  selectionObserver.observe(element, { childList: true, characterData: true, subtree: true })
  return true
}

const root = document.getElementById('root')
if (root) {
  if (!bindSelectionCount()) {
    rootObserver = new MutationObserver(() => {
      if (bindSelectionCount()) {
        rootObserver?.disconnect()
        rootObserver = null
      }
    })
    rootObserver.observe(root, { childList: true, subtree: true })
  }
}
