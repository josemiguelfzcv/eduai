// The laurel wreath: Lyceo's mark. Two branches rise from stems crossed at the bottom and open into a wide U, each
// with pairs of oval leaves (the outer one a little larger) and a single leaf at the tip. Drawn from geometry, so it
// stays crisp at any size and takes the color it's given.

type Leaf = { x: number; y: number; angle: number; length: number; width: number }

const toRad = (deg: number) => (deg * Math.PI) / 180
const toDeg = (rad: number) => (rad * 180) / Math.PI
const CX = 32
const CY = 28.5
// A little wider than tall, so the branches open out at the top.
const RX = 26
const RY = 24.2

const point = (deg: number) => ({ x: CX + RX * Math.cos(toRad(deg)), y: CY + RY * Math.sin(toRad(deg)) })
/** The direction up the left branch (increasing angle) at a point of the arc, in degrees. */
const along = (deg: number) => toDeg(Math.atan2(RY * Math.cos(toRad(deg)), -RX * Math.sin(toRad(deg))))

/** The left branch's leaves; the right branch is its mirror image. */
const LEFT: Leaf[] = (() => {
  const leaves: Leaf[] = []
  const steps = 7
  for (let i = 0; i < steps; i++) {
    const deg = 103 + i * 17.6
    const { x, y } = point(deg)
    const t = i / (steps - 1)
    const length = 11 + Math.sin(t * Math.PI) * 1.4 - t * 1.2
    leaves.push(
      { x, y, angle: along(deg) - 44, length: length * 1.02, width: 4.7 },
      { x, y, angle: along(deg) + 42, length: length * 0.88, width: 4.2 },
    )
  }
  const tip = point(222)
  leaves.push({ x: tip.x, y: tip.y, angle: along(222) - 14, length: 10, width: 4.4 })
  return leaves
})()

const leafPath = ({ length: l, width: w }: Leaf) =>
  `M0 0C${l * 0.16} ${-w * 0.74} ${l * 0.7} ${-w * 0.78} ${l} 0C${l * 0.7} ${w * 0.78} ${l * 0.16} ${w * 0.74} 0 0Z`

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * The left stem: from a short end below the center, across the other stem, then up along the branch to its tip.
 */
const STEM = (() => {
  const start = point(98)
  const end = point(222)
  // Continue past the crossing, down and to the right, like a tied wreath's ends.
  const tail = { x: start.x + 7.5, y: start.y + 4.2 }
  return `M${r2(tail.x)} ${r2(tail.y)}L${r2(start.x)} ${r2(start.y)}A${RX} ${RY} 0 0 1 ${r2(end.x)} ${r2(end.y)}`
})()

export function LaurelMark({
  size = 28,
  className = '',
  style,
}: {
  size?: number
  className?: string
  /** Sizes in CSS units (vw, say) when `size` is 0. */
  style?: React.CSSProperties
}) {
  return (
    <svg
      width={size || undefined}
      height={size || undefined}
      viewBox="0 0 64 64"
      className={className}
      style={style}
      aria-hidden="true"
      fill="currentColor"
    >
      {[false, true].map((mirror) => (
        <g key={String(mirror)} transform={mirror ? 'translate(64 0) scale(-1 1)' : undefined}>
          <path d={STEM} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          {LEFT.map((leaf, i) => (
            <path
              key={i}
              d={leafPath(leaf)}
              transform={`translate(${r2(leaf.x)} ${r2(leaf.y)}) rotate(${r2(leaf.angle)})`}
            />
          ))}
        </g>
      ))}
    </svg>
  )
}

/** Lyceo's wordmark: the laurel and the name. `large` is the landing's. */
export function LyceoWordmark({ tone = 'dark', large = false }: { tone?: 'dark' | 'light'; large?: boolean }) {
  return (
    <span
      className={`inline-flex items-center ${large ? 'gap-3' : 'gap-2.5'} ${tone === 'light' ? 'text-ivory' : 'text-grove'}`}
    >
      <LaurelMark size={large ? 50 : 36} />
      <span
        className={`font-display font-semibold leading-none tracking-[-0.02em] ${large ? 'text-[2.5rem]' : 'text-[1.85rem]'}`}
      >
        Lyceo
      </span>
    </span>
  )
}
