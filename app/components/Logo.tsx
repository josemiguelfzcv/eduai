import Link from 'next/link'

/** The Lyceo theta mark and wordmark. `light` is the outline version used over photography. */
export function Logo({ href = '/', tone = 'dark' }: { href?: string; tone?: 'dark' | 'light' }) {
  const light = tone === 'light'
  return (
    <Link
      href={href}
      aria-label="Lyceo home"
      className={`inline-flex items-center gap-2.5 rounded-md no-underline ${light ? 'text-ivory' : 'text-ink'}`}
    >
      <ThetaMark tone={tone} size={30} />
      <span className="font-display text-[1.6rem] font-medium leading-none tracking-[-0.015em]">Lyceo</span>
    </Link>
  )
}

export function ThetaMark({ tone = 'dark', size = 30 }: { tone?: 'dark' | 'light'; size?: number }) {
  const light = tone === 'light'
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle
        cx="32"
        cy="32"
        r="29.5"
        fill={light ? 'rgba(246,241,231,0.08)' : '#1f3b2d'}
        stroke={light ? '#f6f1e7' : '#c2a15a'}
        strokeWidth="3"
      />
      <ellipse cx="32" cy="32" rx="11" ry="15" fill="none" stroke="#f6f1e7" strokeWidth="4.5" />
      <path d="M23 32h18" stroke="#f6f1e7" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}
