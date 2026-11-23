// The laurel wreath: Lyceo's mark in the learning environment and the avatar of its messages. Two branches rise from
// the base, each with pairs of pointed leaves that shrink toward the tip. Drawn from geometry, so it stays crisp at any
// size and takes the color it's given.

type Leaf = { x: number; y: number; angle: number; length: number; width: number }

const toRad = (deg: number) => (deg * Math.PI) / 180

/** The left branch's leaves; the right branch is its mirror image. */
const LEFT: Leaf[] = (() => {
  const cx = 32
  const cy = 31
  const r = 21
  const leaves: Leaf[] = []
  const pairs = 7
  for (let i = 0; i < pairs; i++) {
    const t = i / (pairs - 1)
    const theta = toRad(108 + t * 112)
    const x = cx + r * Math.cos(theta)
    const y = cy + r * Math.sin(theta)
    // The branch runs upward: its direction is the arc's tangent.
    const along = (Math.atan2(Math.cos(theta), -Math.sin(theta)) * 180) / Math.PI
    const length = 11 - t * 3.5
    const width = 3.5 - t * 1.1
    leaves.push({ x, y, angle: along + 40, length, width }, { x, y, angle: along - 34, length: length * 0.9, width })
  }
  // The tip: one leaf straight along the branch.
  const end = toRad(226)
  leaves.push({
    x: cx + r * Math.cos(end),
    y: cy + r * Math.sin(end),
    angle: (Math.atan2(Math.cos(end), -Math.sin(end)) * 180) / Math.PI,
    length: 8,
    width: 2.6,
  })
  return leaves
})()

const leafPath = ({ length: l, width: w }: Leaf) =>
  `M0 0C${l * 0.3} ${-w} ${l * 0.75} ${-w * 0.9} ${l} 0C${l * 0.75} ${w * 0.9} ${l * 0.3} ${w} 0 0Z`

const r2 = (n: number) => Math.round(n * 100) / 100

export function LaurelMark({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true" fill="currentColor">
      {[false, true].map((mirror) => (
        <g key={String(mirror)} transform={mirror ? 'translate(64 0) scale(-1 1)' : undefined}>
          <path
            d="M29.44 51.84A21 21 0 0 1 18.22 15.15"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
          />
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
