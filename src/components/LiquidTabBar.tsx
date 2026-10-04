import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { LiquidGlass, type LiquidGlassHandle } from 'liquid-glass-web-react'

export type AppTab = 'films' | 'timetable' | 'curator' | 'settings'

type LiquidTabBarProps = {
  activeTab: AppTab
  timetableCount: number
  onOpenFilms: () => void
  onOpenTimetable: () => void
  onOpenCurator: () => void
  onOpenSettings: () => void
}

const items = [
  { id: 'films', label: '영화 찾기', icon: 'search' },
  { id: 'timetable', label: '내 시간표', icon: 'calendar' },
  { id: 'curator', label: 'AI 도슨트', icon: 'sparkles' },
  { id: 'settings', label: '설정', icon: 'settings' },
] as const

function TabIcon({ name }: { name: typeof items[number]['icon'] }) {
  if (name === 'search') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.6" /><path d="m16 16 4 4" /></svg>
  if (name === 'calendar') return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="15" rx="3" /><path d="M8 3.5v4M16 3.5v4M3.5 10h17M8 14h3M13 14h3M8 17h3" /></svg>
  if (name === 'sparkles') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8c.7 4.5 2.7 6.5 7.2 7.2-4.5.7-6.5 2.7-7.2 7.2-.7-4.5-2.7-6.5-7.2-7.2C9.3 9.3 11.3 7.3 12 2.8Z" /><path d="M19 15.5c.3 2 1.2 2.9 3.2 3.2-2 .3-2.9 1.2-3.2 3.2-.3-2-1.2-2.9-3.2-3.2 2-.3 2.9-1.2 3.2-3.2Z" /></svg>
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></svg>
}

type LensGeometry = { width: number; height: number; surfaceWidth: number; surfaceHeight: number }
type LensPosition = { x: number; y: number }

const initialLensGeometry: LensGeometry = { width: 92, height: 59, surfaceWidth: 352, surfaceHeight: 63 }
const initialLensPosition: LensPosition = { x: 0.125, y: 0.5 }
const ACTIVE_LENS_OPTIONS = {
  strength: 0.11,
  chromaticAberration: 0.31,
  blur: 0,
  depth: 11,
  curvature: 0.93,
  glow: 0.1,
  edgeHighlight: 0.34,
  specular: 1,
}

function useMediaPreference(queryText: string) {
  const [matches, setMatches] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia(queryText).matches
  ))

  useEffect(() => {
    const query = window.matchMedia(queryText)
    const update = () => setMatches(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [queryText])

  return matches
}

function useDockLensGeometry(activeTab: AppTab, enabled: boolean) {
  const dockRef = useRef<HTMLDivElement>(null)
  const lensRef = useRef<LiquidGlassHandle>(null)
  const [geometry, setGeometry] = useState(initialLensGeometry)
  const [pressedTab, setPressedTab] = useState<AppTab | null>(null)
  const positionRef = useRef<LensPosition>(initialLensPosition)

  const syncLensPosition = useCallback((position: LensPosition) => {
    const dock = dockRef.current
    const lensHost = dock?.querySelector<HTMLElement>('[data-tab-lens-host="true"]')
    if (dock && lensHost) {
      const dockRect = dock.getBoundingClientRect()
      const hostRect = lensHost.getBoundingClientRect()
      // LiquidGlass is inset by the surface border while the action track is
      // measured against the outer surface. Convert the one canonical screen
      // point into the host's coordinate space before moving its SVG lens.
      if (
        dockRect.width > 0
        && dockRect.height > 0
        && hostRect.width > 0
        && hostRect.height > 0
        && Number.isFinite(position.x)
        && Number.isFinite(position.y)
      ) {
        const x = (dockRect.left + position.x * dockRect.width - hostRect.left) / hostRect.width
        const y = (dockRect.top + position.y * dockRect.height - hostRect.top) / hostRect.height
        if (Number.isFinite(x) && Number.isFinite(y)) lensRef.current?.setPosition(x, y)
      }
    } else {
      if (Number.isFinite(position.x) && Number.isFinite(position.y)) {
        lensRef.current?.setPosition(position.x, position.y)
      }
    }
    dock?.style.setProperty('--dock-lens-x', `${position.x}`)
    dock?.style.setProperty('--dock-lens-y', `${position.y}`)
  }, [])

  const syncLensDimensions = useCallback((width: number, height: number) => {
    dockRef.current?.style.setProperty('--dock-lens-width', `${width}px`)
    dockRef.current?.style.setProperty('--dock-lens-height', `${height}px`)
  }, [])

  const moveLens = useCallback((next: LensPosition) => {
    positionRef.current = { ...next }
    syncLensPosition(next)
  }, [syncLensPosition])

  const measureButton = useCallback((button: HTMLButtonElement) => {
    const dock = dockRef.current
    if (!dock) return
    const dockRect = dock.getBoundingClientRect()
    const buttonRect = button.getBoundingClientRect()
    if (
      ![dockRect.width, dockRect.height, buttonRect.width, buttonRect.height].every(Number.isFinite)
      || dockRect.width <= 0
      || dockRect.height <= 0
      || buttonRect.width <= 0
      || buttonRect.height <= 0
    ) return

    // The actions own an explicit, inset four-slot track. Measure its actual
    // center rather than reconstructing it from the outer surface, so the SVG
    // lens, optical lens, and hit targets stay on one coordinate system.
    const width = Math.min(92, buttonRect.width + 5.5)
    if (!Number.isFinite(width) || width <= 0) return
    const height = Math.min(60, Math.max(58, buttonRect.height))
    setGeometry((current) => (
      Math.abs(current.width - width) < 0.1
      && Math.abs(current.height - height) < 0.1
      && Math.abs(current.surfaceWidth - dockRect.width) < 0.1
      && Math.abs(current.surfaceHeight - dockRect.height) < 0.1
        ? current
        : { width, height, surfaceWidth: dockRect.width, surfaceHeight: dockRect.height }
    ))
    syncLensDimensions(width, height)
    moveLens({
      x: (buttonRect.left - dockRect.left + buttonRect.width / 2) / dockRect.width,
      y: (buttonRect.top - dockRect.top + buttonRect.height / 2) / dockRect.height,
    })
  }, [moveLens, syncLensDimensions])

  const measureActive = useCallback(() => {
    const activeButton = dockRef.current?.querySelector<HTMLButtonElement>('button[aria-current="page"]')
    if (activeButton) measureButton(activeButton)
  }, [measureButton])

  useLayoutEffect(() => {
    const dock = dockRef.current
    if (!dock) return
    measureActive()
    const observer = new ResizeObserver(() => measureActive())
    observer.observe(dock)
    dock.querySelectorAll('button').forEach((button) => observer.observe(button))
    const lensHost = dock.querySelector<HTMLElement>('[data-tab-lens-host="true"]')
    if (lensHost) observer.observe(lensHost)
    const onOrientationChange = () => measureActive()
    window.addEventListener('orientationchange', onOrientationChange)
    return () => {
      observer.disconnect()
      window.removeEventListener('orientationchange', onOrientationChange)
    }
  }, [activeTab, measureActive])

  useEffect(() => {
    if (enabled) syncLensPosition(positionRef.current)
  }, [enabled, syncLensPosition])

  useEffect(() => {
    if (!enabled) return
    syncLensDimensions(geometry.width, geometry.height)
    lensRef.current?.engine?.setOptions({
      ...ACTIVE_LENS_OPTIONS,
      width: geometry.width,
      height: geometry.height,
      radius: 30,
      specularAngle: 45,
    })
  }, [enabled, geometry.height, geometry.width, syncLensDimensions])

  const pressLens = useCallback((tab: AppTab) => {
    if (enabled) setPressedTab(tab)
  }, [enabled])

  const releaseLens = useCallback(() => {
    setPressedTab(null)
  }, [])

  return { dockRef, lensRef, geometry, pressedTab, pressLens, releaseLens }
}

export default function LiquidTabBar({ activeTab, timetableCount, onOpenFilms, onOpenTimetable, onOpenCurator, onOpenSettings }: LiquidTabBarProps) {
  const handlers = { films: onOpenFilms, timetable: onOpenTimetable, curator: onOpenCurator, settings: onOpenSettings }
  const reducedTransparency = useMediaPreference('(prefers-reduced-transparency: reduce)')
  const forcedColors = useMediaPreference('(forced-colors: active)')
  const liquidEnabled = !reducedTransparency && !forcedColors
  const [materialReady, setMaterialReady] = useState(false)
  const [selectionReady, setSelectionReady] = useState(false)
  const materialRef = useRef<LiquidGlassHandle>(null)
  const { dockRef, lensRef, geometry, pressedTab, pressLens, releaseLens } = useDockLensGeometry(activeTab, liquidEnabled)

  useEffect(() => {
    if (!liquidEnabled) {
      setMaterialReady(false)
      setSelectionReady(false)
    }
  }, [liquidEnabled])

  useEffect(() => {
    if (!liquidEnabled) return
    // The package creates its first map before it attaches onMap. Nudge a shape
    // option on the next frame so readiness always reflects an observed map.
    const frame = window.requestAnimationFrame(() => {
      materialRef.current?.engine?.setOptions({ specularAngle: 45.01 })
      lensRef.current?.engine?.setOptions({ specularAngle: 45.01 })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [lensRef, liquidEnabled])

  const tabs = items.map((item) => {
    const active = activeTab === item.id
    return <button
      key={item.id}
      type="button"
      className={active ? 'active' : ''}
      aria-current={active ? 'page' : undefined}
      data-tab-id={item.id}
      data-pressed={pressedTab === item.id ? 'true' : undefined}
      onPointerDown={() => pressLens(item.id)}
      onPointerUp={() => releaseLens()}
      onPointerCancel={() => releaseLens()}
      onPointerLeave={() => pressedTab === item.id && releaseLens()}
      onClick={handlers[item.id]}
    >
      <span className="liquid-tab-icon"><TabIcon name={item.icon} />{item.id === 'timetable' && timetableCount > 0 && <b aria-label={`${timetableCount}개 일정`}>{timetableCount > 99 ? '99+' : timetableCount}</b>}</span>
      <span>{item.label}</span>
    </button>
  })
  const actions = <div className="liquid-tab-actions">{tabs}</div>
  // The package needs a non-zero source to build its map. Keep it as one
  // imperceptible scene instead of four painted slot markers.
  const selectionScene = <div className="liquid-tab-selection-scene" aria-hidden="true" />

  return (
    <nav
      className="liquid-tab-bar"
      aria-label="주요 메뉴"
      data-liquid-ready={materialReady && selectionReady ? 'true' : 'false'}
      data-liquid-enabled={liquidEnabled ? 'true' : 'false'}
      data-lens-pressed={pressedTab ?? undefined}
    >
      <div ref={dockRef} className="liquid-tab-bar-surface">
        {liquidEnabled ? (
          <>
            <LiquidGlass
              ref={materialRef}
              className={`liquid-dock-material-host${materialReady ? ' is-ready' : ''}`}
              data-liquid-glass="dock-material"
              data-dock-material-host="true"
              aria-hidden="true"
              x={0.5}
              y={0.5}
              width={Math.max(1, geometry.surfaceWidth - 2)}
              height={Math.max(1, geometry.surfaceHeight - 2)}
              radius={30}
              strength={0.03}
              chromaticAberration={0.055}
              blur={0}
              depth={9}
              curvature={0.5}
              glow={0.08}
              edgeHighlight={0.19}
              specular={0.62}
              quality={192}
              shadow={false}
              onMapGenerated={() => setMaterialReady(true)}
            >
              <span className="liquid-dock-material" />
            </LiquidGlass>
            <LiquidGlass
              ref={lensRef}
              className={`liquid-tab-selection-host${selectionReady ? ' is-ready' : ''}`}
              data-liquid-glass="tab-selection"
              data-tab-lens-host="true"
              aria-hidden="true"
              x={0.5}
              y={0.5}
              width={geometry.width}
              height={geometry.height}
              radius={30}
              {...ACTIVE_LENS_OPTIONS}
              quality={192}
              shadow={false}
              onMapGenerated={() => setSelectionReady(true)}
            >
                {selectionScene}
            </LiquidGlass>
            <div className="liquid-dock-optical-lens" aria-hidden="true" />
          </>
        ) : null}
        {actions}
      </div>
    </nav>
  )
}
