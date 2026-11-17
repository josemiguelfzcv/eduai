import Link from 'next/link'

export function Logo({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 rounded-md text-ink no-underline">
      <svg width="28" height="28" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r="30" fill="#2b6cb0" stroke="#c9a84c" strokeWidth="4" />
        <ellipse cx="32" cy="32" rx="11" ry="15" fill="none" stroke="#faf6ee" strokeWidth="4.5" />
        <path d="M23 32h18" stroke="#faf6ee" strokeWidth="4" strokeLinecap="round" />
      </svg>
      <span className="font-display text-[1.45rem] font-semibold tracking-tight">Lyceo</span>
    </Link>
  )
}
