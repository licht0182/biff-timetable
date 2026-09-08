from pathlib import Path

path = Path('src/App.tsx')
text = path.read_text()
old = """  const openFilms = useCallback(() => {
    setActiveTab('films')
    setSettingsOpen(false)
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.scrollTo(0, filmScrollPositionRef.current))
    })
  }, [])
"""
new = """  const openFilms = useCallback(() => {
    const target = filmScrollPositionRef.current
    setActiveTab('films')
    setSettingsOpen(false)

    let attempts = 0
    const restore = () => {
      attempts += 1
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
      const canReachTarget = maxScroll >= target - 2
      if (canReachTarget || attempts >= 40) {
        window.scrollTo(0, Math.min(target, maxScroll))
        if (Math.abs(window.scrollY - target) > 120 && attempts < 40) window.setTimeout(restore, 16)
        return
      }
      window.setTimeout(restore, 16)
    }

    window.setTimeout(restore, 0)
  }, [])
"""
if old not in text:
    raise SystemExit('missing openFilms scroll restore block')
path.write_text(text.replace(old, new, 1))
