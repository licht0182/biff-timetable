import { useEffect, useRef, useState } from 'react'
import { DOCK_OPTICAL_SETTINGS, opticalDisplacementAtDepth } from '../liquid-glass-optics'

type LiquidGlassPreset = 'navigation' | 'dock' | 'toolbar' | 'content' | 'sheet' | 'modal'
type LiquidGlassModel = 'legacy' | 'chromatic' | 'optical'

type FilterSurface = {
  element: HTMLElement
  layer: HTMLSpanElement | null
  edgeLayer: HTMLSpanElement
  highlightLayer: HTMLSpanElement
  id: string
  preset: LiquidGlassPreset
  model: LiquidGlassModel
  usesRefraction: boolean
  width: number
  height: number
  radius: number
  filterScale: number
  displacement: string
  specular: string
  edgeMask: string
}

type GlassMaps = Pick<FilterSurface, 'displacement' | 'specular' | 'edgeMask' | 'filterScale'>

const TARGETS: Array<{ selector: string; preset: LiquidGlassPreset; usesRefraction: boolean }> = [
  { selector: '.topbar, .tabs', preset: 'navigation', usesRefraction: true },
  { selector: '.liquid-tab-bar-surface', preset: 'dock', usesRefraction: true },
  { selector: '.film-results-toolbar, .enhanced-timetable-actions', preset: 'toolbar', usesRefraction: true },
  // Refracting every virtualized card creates dozens of WebKit compositing layers.
  // Content keeps the translucent lens/bevel treatment without a live SVG filter.
  { selector: '.layout-surface, .notice, .controls, .film-card, .schedule-screening-group, .schedule-list-row, .booking-plan-panel, .booking-plan-group, .booking-plan-item, .timetable-scroll, .timetable-empty, .settings-intro, .settings-card, .settings-reset-card, .settings-card-head, .precise-transfer-panel, .travel-matrix-wrap, .curator-hero, .curator-featured, .curator-featured-card, .curator-latest, .curator-method, .curator-card, .curator-article, .curator-film-guide, .curator-stat, .curator-article-footer, .film-detail-grid, .film-search-suggestions, .backup-menu > div, .timetable-more-menu > div, .pwa-update-toast', preset: 'content', usesRefraction: false },
  { selector: '#film-advanced-filters.filter-row.mobile-open', preset: 'sheet', usesRefraction: true },
  { selector: '.film-modal, .booking-conflict-dialog, .booking-apply-dialog, .custom-event-dialog, .custom-event-modal', preset: 'modal', usesRefraction: true },
]

const PRESETS = {
  navigation: { radius: 30, bezel: 34, scale: 38, specular: 0.9 },
  // Keep legacy dock geometry identical to navigation; the experiment changes only compositing.
  dock: { radius: 30, bezel: 34, scale: 38, specular: 0.9 },
  toolbar: { radius: 22, bezel: 28, scale: 30, specular: 0.82 },
  content: { radius: 24, bezel: 26, scale: 26, specular: 0.76 },
  sheet: { radius: 32, bezel: 34, scale: 34, specular: 0.86 },
  modal: { radius: 32, bezel: 34, scale: 34, specular: 0.86 },
} satisfies Record<LiquidGlassPreset, { radius: number; bezel: number; scale: number; specular: number }>

const mapCache = new Map<string, GlassMaps>()
let nextFilterId = 0

function isIOSWebKitRuntime() {
  if (typeof navigator === 'undefined') return false
  const iPadDesktopUA = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return (/iPhone|iPad|iPod/i.test(navigator.userAgent) || iPadDesktopUA) && /WebKit/i.test(navigator.userAgent)
}

function supportsBackdropRefraction() {
  if (typeof navigator === 'undefined' || typeof CSS === 'undefined') return false
  const userAgentData = (navigator as Navigator & { userAgentData?: { brands?: Array<{ brand: string }> } }).userAgentData
  const brands = userAgentData?.brands?.map((brand) => brand.brand).join(' ') ?? ''
  const chromium = /Chromium|Google Chrome|Microsoft Edge/i.test(brands || navigator.userAgent)
  const iosWebKit = isIOSWebKitRuntime()
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

function createGlassMaps(
  width: number,
  height: number,
  preset: LiquidGlassPreset,
  model: LiquidGlassModel,
  surfaceRadius: number,
): GlassMaps {
  const optical = model === 'optical' && preset === 'dock'
  const cacheRadius = optical ? Math.round(surfaceRadius * 10) / 10 : PRESETS[preset].radius
  const key = `${model}:${preset}:${width}x${height}:r${cacheRadius}`
  const cached = mapCache.get(key)
  if (cached) return cached

  const settings = PRESETS[preset]
  const maxMapDimension = optical ? 192 : 64
  const renderScale = Math.min(1, maxMapDimension / width, maxMapDimension / height)
  const mapWidth = Math.max(8, Math.round(width * renderScale))
  const mapHeight = Math.max(8, Math.round(height * renderScale))
  const radiusCss = optical ? surfaceRadius : settings.radius
  const radius = Math.min(radiusCss * renderScale, mapWidth / 2, mapHeight / 2)
  const bezelCss = optical ? DOCK_OPTICAL_SETTINGS.bezel : settings.bezel
  const bezel = Math.max(2, bezelCss * renderScale)

  const displacementCanvas = document.createElement('canvas')
  const specularCanvas = document.createElement('canvas')
  const edgeMaskCanvas = document.createElement('canvas')
  displacementCanvas.width = specularCanvas.width = edgeMaskCanvas.width = mapWidth
  displacementCanvas.height = specularCanvas.height = edgeMaskCanvas.height = mapHeight
  const displacementContext = displacementCanvas.getContext('2d')
  const specularContext = specularCanvas.getContext('2d')
  const edgeMaskContext = edgeMaskCanvas.getContext('2d')
  if (!displacementContext || !specularContext || !edgeMaskContext) {
    return { displacement: '', specular: '', edgeMask: '', filterScale: settings.scale }
  }

  const displacementImage = displacementContext.createImageData(mapWidth, mapHeight)
  const specularImage = specularContext.createImageData(mapWidth, mapHeight)
  const edgeMaskImage = edgeMaskContext.createImageData(mapWidth, mapHeight)
  const epsilon = 0.75

  const opticalMagnitudeAt = (x: number, y: number, distance: number) => {
    if (!optical || distance > 0) return 0
    const depthMap = Math.min(bezel, Math.max(0, -distance))
    const depthCss = depthMap / renderScale
    const raw = opticalDisplacementAtDepth(depthCss, DOCK_OPTICAL_SETTINGS)
    const textureEdgeDistance = Math.min(x, y, mapWidth - x - 1, mapHeight - y - 1)
    const textureEdgeFade = Math.min(1, Math.max(0, textureEdgeDistance / 2))
    return raw * textureEdgeFade
  }

  let maximumOpticalDisplacement = 0
  if (optical) {
    for (let y = 0; y < mapHeight; y += 1) {
      for (let x = 0; x < mapWidth; x += 1) {
        const distance = roundedRectangleDistance(x + 0.5, y + 0.5, mapWidth, mapHeight, radius)
        maximumOpticalDisplacement = Math.max(
          maximumOpticalDisplacement,
          opticalMagnitudeAt(x, y, distance),
        )
      }
    }
  }

  const opticalNormalizer = maximumOpticalDisplacement || 1

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
      const displacementAmount = optical
        ? opticalMagnitudeAt(x, y, distance) / opticalNormalizer
        : easedEdge * 0.9

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

      const maskAlpha = Math.round(255 * easedEdge)
      edgeMaskImage.data[index] = 255
      edgeMaskImage.data[index + 1] = 255
      edgeMaskImage.data[index + 2] = 255
      edgeMaskImage.data[index + 3] = maskAlpha
    }
  }

  displacementContext.putImageData(displacementImage, 0, 0)
  specularContext.putImageData(specularImage, 0, 0)
  edgeMaskContext.putImageData(edgeMaskImage, 0, 0)
  const maps = {
    displacement: displacementCanvas.toDataURL('image/png'),
    specular: specularCanvas.toDataURL('image/png'),
    edgeMask: edgeMaskCanvas.toDataURL('image/png'),
    filterScale: optical ? Math.max(1, maximumOpticalDisplacement) : settings.scale,
  }
  if (mapCache.size >= 32) mapCache.delete(mapCache.keys().next().value ?? '')
  mapCache.set(key, maps)
  return maps
}

export default function LiquidGlassEffects() {
  const [filters, setFilters] = useState<FilterSurface[]>([])
  const surfaces = useRef(new Map<HTMLElement, FilterSurface>())

  useEffect(() => {
    const nativeBackdropRefraction = supportsBackdropRefraction()
    const iosWebKit = isIOSWebKitRuntime()
    const dockGlassParam = new URLSearchParams(window.location.search).get('dockGlass')
    const dockModel: LiquidGlassModel = dockGlassParam === 'optical'
      ? 'optical'
      : dockGlassParam === 'chromatic'
        ? 'chromatic'
        : 'legacy'
    document.documentElement.classList.toggle('ios-webkit', iosWebKit)
    const transparencyPreference = window.matchMedia('(prefers-reduced-transparency: reduce)')
    let frame = 0

    const clearSurface = (surface: FilterSurface) => {
      surface.element.classList.remove('liquid-glass-enhanced')
      surface.element.classList.remove('liquid-glass-backdrop-refraction')
      surface.element.classList.remove('liquid-glass-edge-host')
      surface.element.classList.remove('liquid-glass-positioned')
      surface.element.removeAttribute('data-liquid-glass')
      surface.element.removeAttribute('data-liquid-glass-model')
      surface.element.style.removeProperty('--liquid-filter')
      surface.layer?.remove()
      surface.edgeLayer.remove()
      surface.highlightLayer.remove()
    }

    const applyEdgeOnly = (surface: FilterSurface) => {
      const { element, edgeLayer, highlightLayer } = surface
      if (!edgeLayer.isConnected) element.append(edgeLayer)
      if (!highlightLayer.isConnected) element.append(highlightLayer)
      element.classList.remove('liquid-glass-enhanced')
      element.classList.remove('liquid-glass-backdrop-refraction')
      element.classList.add('liquid-glass-edge-host')
      element.dataset.liquidGlass = surface.preset
      element.dataset.liquidGlassModel = surface.model
      element.style.removeProperty('--liquid-filter')
      surface.layer?.remove()
    }

    const publish = () => {
      frame = 0
      if (transparencyPreference.matches) {
        surfaces.current.forEach(applyEdgeOnly)
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
        const computedRadius = surface.model === 'optical'
          ? Number.parseFloat(getComputedStyle(element).borderTopLeftRadius) || PRESETS[surface.preset].radius
          : PRESETS[surface.preset].radius
        if (
          surface.usesRefraction
          && (width !== surface.width || height !== surface.height || computedRadius !== surface.radius)
        ) {
          const maps = createGlassMaps(width, height, surface.preset, surface.model, computedRadius)
          surface.width = width
          surface.height = height
          surface.radius = computedRadius
          surface.filterScale = maps.filterScale
          surface.displacement = maps.displacement
          surface.specular = maps.specular
          surface.edgeMask = maps.edgeMask
        }
        if (surface.layer && !surface.layer.isConnected) element.append(surface.layer)
        if (!surface.edgeLayer.isConnected) element.append(surface.edgeLayer)
        if (!surface.highlightLayer.isConnected) element.append(surface.highlightLayer)
        element.classList.add('liquid-glass-enhanced')
        element.classList.add('liquid-glass-edge-host')
        element.classList.toggle('liquid-glass-backdrop-refraction', nativeBackdropRefraction && surface.usesRefraction)
        element.dataset.liquidGlass = surface.preset
        element.dataset.liquidGlassModel = surface.model
        if (surface.usesRefraction) {
          element.style.setProperty('--liquid-filter', `url("#${surface.id}")`)
          next.push({ ...surface })
        } else {
          element.style.removeProperty('--liquid-filter')
        }
      })
      setFilters(next)
    }

    const schedulePublish = () => {
      if (!frame) frame = window.requestAnimationFrame(publish)
    }

    const resizeObserver = new ResizeObserver(schedulePublish)
    const discover = () => {
      TARGETS.forEach(({ selector, preset, usesRefraction }) => {
        document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
          if (surfaces.current.has(element)) return
          if (getComputedStyle(element).position === 'static') {
            element.classList.add('liquid-glass-positioned')
          }
          // iOS WebKit cannot use the SVG backdrop refraction path reliably.
          // Do not create the extra compositing layer there; retain the CSS glass surface instead.
          const effectiveUsesRefraction = usesRefraction && !iosWebKit
          const model: LiquidGlassModel = preset === 'dock' ? dockModel : 'legacy'
          const layer = effectiveUsesRefraction ? document.createElement('span') : null
          if (layer) {
            layer.className = 'liquid-glass-refraction-layer'
            layer.setAttribute('aria-hidden', 'true')
            element.append(layer)
          }
          const edgeLayer = document.createElement('span')
          edgeLayer.className = 'liquid-glass-edge-layer'
          edgeLayer.setAttribute('aria-hidden', 'true')
          element.append(edgeLayer)
          const highlightLayer = document.createElement('span')
          highlightLayer.className = 'liquid-glass-edge-highlight-layer'
          highlightLayer.setAttribute('aria-hidden', 'true')
          element.append(highlightLayer)
          const surface: FilterSurface = {
            element,
            layer,
            edgeLayer,
            highlightLayer,
            id: `liquid-glass-${++nextFilterId}`,
            preset,
            model,
            usesRefraction: effectiveUsesRefraction,
            width: 0,
            height: 0,
            radius: 0,
            filterScale: PRESETS[preset].scale,
            displacement: '',
            specular: '',
            edgeMask: '',
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
      document.documentElement.classList.remove('ios-webkit')
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
        x={-surface.filterScale}
        y={-surface.filterScale}
        width={surface.width + surface.filterScale * 2}
        height={surface.height + surface.filterScale * 2}
        filterUnits="userSpaceOnUse"
        primitiveUnits="userSpaceOnUse"
        colorInterpolationFilters="sRGB"
      >
        <feImage href={surface.displacement} x="0" y="0" width={surface.width} height={surface.height} preserveAspectRatio="none" result="displacement-map" />
        {surface.model !== 'legacy' ? <>
          <feImage href={surface.edgeMask} x="0" y="0" width={surface.width} height={surface.height} preserveAspectRatio="none" result="edge-mask" />
          <feDisplacementMap in="SourceGraphic" in2="displacement-map" scale={surface.filterScale} xChannelSelector="R" yChannelSelector="G" result="red-displaced" />
          <feColorMatrix in="red-displaced" type="matrix" values={'1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0'} result="red-channel" />
          <feDisplacementMap in="SourceGraphic" in2="displacement-map" scale={surface.filterScale * 0.975} xChannelSelector="R" yChannelSelector="G" result="green-displaced" />
          <feColorMatrix in="green-displaced" type="matrix" values={'0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0'} result="green-channel" />
          <feDisplacementMap in="SourceGraphic" in2="displacement-map" scale={surface.filterScale * 0.95} xChannelSelector="R" yChannelSelector="G" result="blue-displaced" />
          <feColorMatrix in="blue-displaced" type="matrix" values={'0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0'} result="blue-channel" />
          <feBlend in="green-channel" in2="blue-channel" mode="screen" result="gb-combined" />
          <feBlend in="red-channel" in2="gb-combined" mode="screen" result="rgb-combined" />
          <feComposite in="rgb-combined" in2="edge-mask" operator="in" result="edge-refracted" />
          <feComponentTransfer in="edge-mask" result="center-mask">
            <feFuncA type="table" tableValues="1 0" />
          </feComponentTransfer>
          <feComposite in="SourceGraphic" in2="center-mask" operator="in" result="clean-center" />
          <feComposite in="edge-refracted" in2="clean-center" operator="over" result="refracted" />
        </> : <feDisplacementMap in="SourceGraphic" in2="displacement-map" scale={surface.filterScale} xChannelSelector="R" yChannelSelector="G" result="refracted" />}
        <feImage href={surface.specular} x="0" y="0" width={surface.width} height={surface.height} preserveAspectRatio="none" result="specular-map" />
        <feBlend in="refracted" in2="specular-map" mode="screen" />
      </filter>)}
    </defs>
  </svg>
}
