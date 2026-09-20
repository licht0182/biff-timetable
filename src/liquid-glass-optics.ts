export type OpticalGlassSettings = {
  bezel: number
  thickness: number
  refractiveIndex: number
  exponent: number
  scaleRatio: number
}

export const DOCK_OPTICAL_SETTINGS: OpticalGlassSettings = {
  bezel: 22,
  thickness: 14,
  refractiveIndex: 1.5,
  exponent: 4,
  scaleRatio: 2.6,
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/**
 * Convex superellipse/squircle profile used by the Kube Liquid Glass study.
 * x=0 is the outer rim and x=1 is the flat interior.
 */
export function convexSquircleHeight(x: number, exponent = 4) {
  const clamped = clamp(x, 0, 1)
  const inside = Math.max(0, 1 - Math.pow(1 - clamped, exponent))
  return Math.pow(inside, 1 / exponent)
}

export function surfaceDerivative(x: number, exponent = 4, delta = 0.001) {
  const left = clamp(x - delta, 0, 1)
  const right = clamp(x + delta, 0, 1)
  if (right === left) return 0
  return (convexSquircleHeight(right, exponent) - convexSquircleHeight(left, exponent)) / (right - left)
}

/**
 * Approximate one-interface refraction for a vertical incident ray.
 *
 * The surface derivative is converted from normalized profile units into
 * CSS-pixel slope using thickness / bezel. Snell's law bends the ray toward
 * the surface normal inside glass. The remaining angle from vertical produces
 * a lateral shift while the ray traverses the local glass height.
 */
export function opticalDisplacementAtDepth(depthFromEdge: number, settings: OpticalGlassSettings) {
  if (depthFromEdge <= 0 || depthFromEdge >= settings.bezel) return 0

  const x = clamp(depthFromEdge / settings.bezel, 0, 1)
  const heightRatio = convexSquircleHeight(x, settings.exponent)
  const derivative = surfaceDerivative(x, settings.exponent)
  const surfaceSlope = Math.abs(derivative) * settings.thickness / settings.bezel
  const normalAngle = Math.atan(surfaceSlope)
  const refractedAngle = Math.asin(clamp(Math.sin(normalAngle) / settings.refractiveIndex, -1, 1))
  const deflectionAngle = Math.max(0, normalAngle - refractedAngle)
  const localHeight = settings.thickness * heightRatio

  return localHeight * Math.tan(deflectionAngle) * settings.scaleRatio
}
