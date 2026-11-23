'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { signInWithGoogle, supabase } from '../lib/supabase'

/**
 * Starts Google sign-in, or links to My Academy when the visitor already has a session.
 * Every "Get started" on the site goes through here, so the flow stays the same everywhere.
 */
export function SignInButton({
  className = 'btn btn-quiet',
  label = 'Sign in with Google',
  signedInLabel = 'Open My Academy',
  icon = 'google',
  hideWhenSignedIn = false,
  style,
}: {
  className?: string
  style?: React.CSSProperties
  label?: string
  signedInLabel?: string
  icon?: 'google' | 'arrow' | 'none'
  hideWhenSignedIn?: boolean
}) {
  const [signedIn, setSignedIn] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session))
  }, [])

  if (signedIn) {
    if (hideWhenSignedIn) return null
    return (
      <Link href="/dashboard" className={`${className} no-underline`} style={style}>
        {signedInLabel}
        {icon === 'arrow' && <ArrowIcon />}
      </Link>
    )
  }

  return (
    <button
      type="button"
      className={className}
      style={style}
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        const { error } = await signInWithGoogle()
        if (error) setBusy(false)
      }}
    >
      {icon === 'google' && (busy ? <span className="spinner" /> : <GoogleMark />)}
      {label}
      {icon === 'arrow' && (busy ? <span className="spinner" /> : <ArrowIcon />)}
    </button>
  )
}

export function ArrowIcon() {
  return (
    <svg className="btn-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2.5 8h10.5M9 3.5 13.5 8 9 12.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.7 17.7 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.5 5.8c4.4-4 6.8-10 6.8-17.2z"
      />
      <path
        fill="#FBBC05"
        d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.8 6C6.6 42.6 14.6 48 24 48z"
      />
    </svg>
  )
}
