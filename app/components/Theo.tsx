'use client'

import { useEffect, useState } from 'react'

/**
 * Theo, Lyceo's tutor. Renders /theo.png (drop the real 3D render into /public)
 * and falls back to a laurel medallion until that file exists.
 * Always floats on the page, never inside a box.
 */
export function Theo({
  size = 160,
  speaking = false,
  float = true,
  className = '',
}: {
  size?: number
  speaking?: boolean
  float?: boolean
  className?: string
}) {
  const [missing, setMissing] = useState(false)

  // The <img> can fail before hydration, when onError isn't attached yet, so probe it separately.
  useEffect(() => {
    const probe = new Image()
    probe.onerror = () => setMissing(true)
    probe.src = '/theo.png'
  }, [])

  return (
    <div className={`select-none ${className}`} style={{ width: size }} aria-hidden="true">
      <div className={`relative ${float ? 'theo-float' : ''}`}>
        {missing ? (
          <TheoMedallion size={size} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/theo.png"
            alt=""
            width={size}
            height={size}
            onError={() => setMissing(true)}
            className="block h-auto w-full drop-shadow-[0_14px_18px_rgba(28,39,51,0.22)]"
          />
        )}
        {speaking && <SpeakingBars />}
      </div>
    </div>
  )
}

function SpeakingBars() {
  return (
    <div className="absolute -bottom-1 left-1/2 flex h-4 -translate-x-1/2 items-end gap-[3px]">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="w-[4px] rounded-full bg-gold motion-safe:animate-[theo-bar_700ms_ease-in-out_infinite_alternate]"
          style={{ height: 6 + ((i * 5) % 9), animationDelay: `${i * 140}ms` }}
        />
      ))}
    </div>
  )
}

const LEAVES = Array.from({ length: 9 }, (_, i) => 118 + i * 15)

export function TheoMedallion({ size = 160 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className="block drop-shadow-[0_14px_18px_rgba(28,39,51,0.22)]"
    >
      <circle cx="50" cy="50" r="31" fill="#1f3b2d" />
      <circle cx="50" cy="50" r="31" fill="none" stroke="#c2a15a" strokeWidth="2.5" />
      {[1, -1].map((side) =>
        LEAVES.map((deg) => {
          const a = ((side === 1 ? deg : 180 - deg) * Math.PI) / 180
          const x = 50 + Math.cos(a) * 41
          const y = 50 + Math.sin(a) * 41
          const rot = (side === 1 ? deg : 180 - deg) + 90 + side * 28
          return (
            <ellipse
              key={`${side}${deg}`}
              cx={x}
              cy={y}
              rx="2.6"
              ry="6.4"
              fill="#c2a15a"
              transform={`rotate(${rot} ${x} ${y})`}
            />
          )
        }),
      )}
      <ellipse cx="50" cy="50" rx="10" ry="14" fill="none" stroke="#f6f1e7" strokeWidth="4" />
      <path d="M42 50h16" stroke="#f6f1e7" strokeWidth="3.6" strokeLinecap="round" />
    </svg>
  )
}
