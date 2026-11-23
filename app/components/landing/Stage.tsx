import type { ReactNode } from 'react'

// The landing's sections are pictures with real interface laid over them. A Stage is a box in a section's design
// pixels, scaled to the section's width (the section is a size container), so what is drawn on a device in the picture
// stays on that device at any window size. quadTransform lays a flat screen onto the device's screen as the picture
// shows it, in perspective.

type Point = readonly [number, number]

export function Stage({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0 origin-top-left select-none"
      // tan(atan2(a, b)) is a / b as a plain number: the section's width over the design's.
      style={{ width, height, transform: `scale(tan(atan2(100cqw, ${width}px)))` }}
    >
      {children}
    </div>
  )
}

/** The transform (origin 0 0) that maps a width × height box onto the corners top-left, top-right, bottom-right,
 * bottom-left: the projective map of a rectangle onto a quadrilateral. */
export function quadTransform(width: number, height: number, corners: readonly [Point, Point, Point, Point]) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = corners
  const sx = x0 - x1 + x2 - x3
  const sy = y0 - y1 + y2 - y3
  const det = (x1 - x2) * (y3 - y2) - (x3 - x2) * (y1 - y2)
  const g = (sx * (y3 - y2) - (x3 - x2) * sy) / det
  const h = ((x1 - x2) * sy - sx * (y1 - y2)) / det
  const a = x1 - x0 + g * x1
  const b = x3 - x0 + h * x3
  const d = y1 - y0 + g * y1
  const e = y3 - y0 + h * y3
  const m = [a / width, d / width, 0, g / width, b / height, e / height, 0, h / height, 0, 0, 1, 0, x0, y0, 0, 1]
  return `matrix3d(${m.map((n) => Number(n.toPrecision(9))).join(', ')})`
}
