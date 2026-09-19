import { useEffect, useRef, useState } from 'react'

type LiquidGlassPreset = 'navigation' | 'toolbar' | 'sheet' | 'modal'

type FilterSurface = {
  element: HTMLElement
  id: string
  preset: LiquidGlassPreset
  width: number
  height: number
  displacement: string
  specular: string
}

type GlassMaps = Pick<FilterSurface, 'displacement' | 'specular'>

const TARGETS: Array<{ selector: string; preset: LiquidGlassPreset }> = [
  { selector: '.topbar, .tabs, .liquid-tab-bar-surface', preset: 'navigation' },
  { selector: '.film-results-toolbar, .enhanced-timetable-actions', preset: 'toolbar' },
  { selector: '#film-advanced-filters.filter-row.mobile-open', preset: 'sheet' },
  { selector: '.film-modal, .booking-conflict-dialog, .booking-apply-dialog, .custom-event-dialog, .custom-event-modal', preset: 'modal' },
]

const PRESETS = {
  navigation: { radius: 26, bezel: 18, scale: 8, specular: 0.42 },
  toolbar: { radius: 20, bezel: 14, scale: 6, specular: 0.34 },
  sheet: { radius: 30, bezel: 20, scale: 4, specular: 0.28 },
  modal: { radius: 30, bezel: 20, scale: 4, specular: 0.3 },
} satisfies Record<LiquidGlassPreset, { radius: number; bezel: number; scale: number; specular: number }>

const mapCache = new Map<string, GlassMaps>()
let nextFilterId = 0

function isChromiumRuntime() {
  if (typeof navigator === 'undefined' || typeof CSS === 'undefined') return false
  const userAgentData = (navigator as Navigator & { userAgentData?: { brands?: Array<{ brand: string }> } }).userAgentData
  const brands = userAgentData?.brands?.map((brand) => brand.brand).join(' ') ?? ''
  const chromium = /Chromium|Google Chrome|Microsoft Edge/i.test(brands || navigator.userAgent)
  const iosWebKit = /iPhone|iPad|iPod/i.test(navigator.userAgent)
  return chromium && !iosWebKit && CSS.supports('backdrop-filter', 'url("#liquid-glass-probe")')
}

function quantize(value: number) {
  return Math.max(16, Math.ceil(value / 16) * 16)
}

function roundedRectangleDistance(x: number, y: number, width: number, height: number, radius: number) {
  const qx = Math.abs(x - width / 2) - (width / 2 - radius)
  const qy = Math.abs(y - height / 2) - (height / 2 - radius)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius
}

function createGlassMaps(width: number, height: number, preset: LiquidGlassPreset): GlassMaps {
  const key = `${preset}:${width}x${height}`
  const cached = mapCache.get(key)
  if (cached) return cached

  const settings = PRESETS[preset]
  const renderScale = Math.min(1, 512 / width, 512 / height)
  const mapWidth = Math.max(8, Math.round(width * renderScale))
  const mapHeight = Math.max(8, Math.round(height * renderScale))
  const radius = Math.min(settings.radius * renderScale, mapWidth / 2, mapHeight / 2)
  const bezel = Math.max(2, settings.bezel * renderScale)
  const displacementCanvas = document.createElement('canvas')
  const specularCanvas = document.createElement('canvas')
  displacementCanvas.width = specularCanvas.width = mapWidth
  displacementCanvas.height = specularCanvas.height = mapHeight
  const displacementContext = displacementCanvas.getContext('2d')
  const specularContext = specularCanvas.getContext('2d')
  if (!displacementContext || !specularContext) return { displacement: '', specular: '' }

  const displacementImage = displacementContext.createImageData(mapWidth, mapHeight)
  const specularImage = specularContext.createImageData(mapWidth, mapHeight)
  const epsilon = 0.75

  for (let y = 0; y < mapHeight; y += 1) {
    for (let x = 0; x < mapWidth; x += 1) {
      const index = (y * mapWidth + x) * 4
      const distance = roundedRectangleDistance(x + 0.5, y + 0.5, mapWidth, mapHeight, radius)
      const edge = distance <= 0 ? Math.max(0, 1 + distance / bezel) : 0
      const easedEdge = edge * edge * (3 - 2 * edge)
      const dx = roundedRectangleDistance(x + epsilon, y, mapWidth, mapHeight, radius)
        - roundedRectangleDistance(x - epsilon, y, mapWidth, mapHeight, radius)
      const dy = roundedRectangleDistance(x, y + epsilon, mapWidth, mapHeight, radius)
        - roundedRectangleDistance(x, y - epsilon, mapWidth, mapHeight, radius)
      const length = Math.hypot(dx, dy) || 1
      const normalX = dx / length
      const normalY = dy / length
      const displacementAmount = easedEdge * 0.9

      displacementImage.data[index] = Math.round(128 + normalX * 127 * displacementAmount)
      displacementImage.data[index + 1] = Math.round(128 + normalY * 127 * displacementAmount)
      displacementImage.data[index + 2] = 128
      displacementImage.data[index + 3] = 255

      const light = Math.max(0, -(normalX * 0.55 + normalY * 0.83))
      const highlight = Math.round(255 * settings.specular * easedEdge * light * light)
      specularImage.data[index] = 255
      specularImage.data[index + 1] = 255
      specularImage.data[index + 2] = 255
      specularImage.data[index + 3] = highlight
    }
  }

  displacementContext.putImageData(displacementImage, 0, 0)
  specularContext.putImageData(specularImage, 0, 0)
  const maps = {
    displacement: displacementCanvas.toDataURL('image/png'),
    specular: specularCanvas.toDataURL('image/png'),
  }
  if (mapCache.size >= 32) mapCache.delete(mapCache.keys().next().value ?? '')
  mapCache.set(key, maps)
  return maps
}

export default function LiquidGlassEffects() {
  const [filters, setFilters] = useState<FilterSurface[]>([])
  const surfaces = useRef(new Map<HTMLElement, FilterSurface>())

  useEffect(() => {
    if (!isChromiumRuntime()) return

    const transparencyPreference = window.matchMedia('(prefers-reduced-transparency: reduce)')
    let frame = 0

    const clearSurface = (surface: FilterSurface) => {
      surface.element.classList.remove('liquid-glass-enhanced')
      surface.element.removeAttribute('data-liquid-glass')
      surface.element.style.removeProperty('--liquid-filter')
    }

    const publish = () => {
      frame = 0
      if (transparencyPreference.matches) {
        surfaces.current.forEach(clearSurface)
        setFilters([])
        return
      }

      const next: FilterSurface[] = []
      surfaces.current.forEach((surface, element) => {
        if (!element.isConnected) {
          clearSurface(surface)
          resizeObserver.unobserve(element)
          surfaces.current.delete(element)
          return
        }
        const rect = element.getBoundingClientRect()
        const width = quantize(rect.width)
        const height = quantize(rect.height)
        if (width !== surface.width || height !== surface.height) {
          const maps = createGlassMaps(width, height, surface.preset)
          surface.width = width
          surface.height = height
          surface.displacement = maps.displacement
          surface.specular = maps.specular
        }
        element.classList.add('liquid-glass-enhanced')
        element.dataset.liquidGlass = surface.preset
        element.style.setProperty('--liquid-filter', `url("#${surface.id}")`)
        next.push({ ...surface })
      })
      setFilters(next)
    }

    const schedulePublish = () => {
      if (!frame) frame = window.requestAnimationFrame(publish)
    }

    const resizeObserver = new ResizeObserver(schedulePublish)
    const discover = () => {
      TARGETS.forEach(({ selector, preset }) => {
        document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
          if (surfaces.current.has(element)) return
          const surface: FilterSurface = {
            element,
            id: `liquid-glass-${++nextFilterId}`,
            preset,
            width: 0,
            height: 0,
            displacement: '',
            specular: '',
          }
          surfaces.current.set(element, surface)
          resizeObserver.observe(element)
        })
      })
      schedulePublish()
    }

    const mutationObserver = new MutationObserver(discover)
    mutationObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
    transparencyPreference.addEventListener('change', schedulePublish)
    discover()

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      mutationObserver.disconnect()
      resizeObserver.disconnect()
      transparencyPreference.removeEventListener('change', schedulePublish)
      surfaces.current.forEach(clearSurface)
      surfaces.current.clear()
    }
  }, [])

  if (!filters.length) return null

  return <svg className="liquid-glass-filter-defs" aria-hidden="true" focusable="false">
    <defs>
      {filters.map((surface) => <filter
        id={surface.id}
        key={surface.id}
        x="0"
        y="0"
        width={surface.width}
        height={surface.height}
        filterUnits="userSpaceOnUse"
        primitiveUnits="userSpaceOnUse"
        colorInterpolationFilters="sRGB"
      >
        <feImage href={surface.displacement} x="0" y="0" width={surface.width} height={surface.height} preserveAspectRatio="none" result="displacement-map" />
        <feDisplacementMap in="SourceGraphic" in2="displacement-map" scale={PRESETS[surface.preset].scale} xChannelSelector="R" yChannelSelector="G" result="refracted" />
        <feImage href={surface.specular} x="0" y="0" width={surface.width} height={surface.height} preserveAspectRatio="none" result="specular-map" />
        <feBlend in="refracted" in2="specular-map" mode="screen" />
      </filter>)}
    </defs>
  </svg>
}
