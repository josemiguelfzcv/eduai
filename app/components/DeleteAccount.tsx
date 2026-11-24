'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ApiError, postJSON, supabase } from '../lib/supabase'

const PHRASE = 'delete my account'

/**
 * Deleting the account, with what it removes said plainly. The server and the database both require a sign-in from
 * the last 15 minutes; if it's older, the student signs in again and comes back here.
 */
export function DeleteAccount({ startOpen = false }: { startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reauth, setReauth] = useState(false)
  const [done, setDone] = useState(false)

  const remove = async () => {
    setBusy(true)
    setError(null)
    try {
      await postJSON('/api/account/delete', { confirm: typed.trim().toLowerCase() })
      setDone(true)
      await supabase.auth.signOut()
    } catch (e) {
      setReauth(e instanceof ApiError && e.status === 401)
      setError(e instanceof Error ? e.message : 'Could not delete your account. Nothing was deleted.')
    } finally {
      setBusy(false)
    }
  }

  const signInAgain = () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/profile?delete=1` },
    })

  if (done) {
    return (
      <div role="status" className="panel p-6">
        <p className="font-display text-[1.3rem]">Your account is deleted.</p>
        <p className="mt-1 text-ink-soft">Everything listed above is gone. You’re signed out.</p>
        <Link href="/" className="btn btn-quiet mt-4 no-underline">
          Go to the home page
        </Link>
      </div>
    )
  }

  return (
    <section aria-labelledby="delete-title" className="rounded-2xl border border-terracotta/30 p-6">
      <h2 id="delete-title" className="text-[1.3rem]">
        Delete your account
      </h2>
      <p className="mt-2 max-w-[62ch] text-[0.95rem] text-ink-soft">
        This deletes your profile, courses, deadlines, lessons, uploaded files, ideas, Quick Checks and every answer
        you’ve given, and disconnects Google Calendar. Records of what the AI calls cost stay, with nothing that links
        them to you. It can’t be undone.{' '}
        <Link href="/privacy" className="text-forest underline underline-offset-4">
          What Lyceo keeps
        </Link>
      </p>
      {!open ? (
        <button
          type="button"
          className="mt-4 text-terracotta underline underline-offset-4"
          onClick={() => setOpen(true)}
        >
          Delete my account
        </button>
      ) : (
        <div className="mt-4 max-w-md space-y-3">
          <label htmlFor="confirm-delete" className="block text-[0.95rem]">
            Type <strong>{PHRASE}</strong> to confirm.
          </label>
          <input
            id="confirm-delete"
            className="field"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            disabled={busy}
          />
          {error && (
            <p role="alert" className="text-[0.95rem] text-terracotta">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            {reauth ? (
              <button type="button" className="btn btn-quiet" onClick={signInAgain}>
                Sign in again
              </button>
            ) : (
              <button
                type="button"
                className="btn border-terracotta bg-terracotta text-white hover:bg-terracotta/90"
                onClick={remove}
                disabled={busy || typed.trim().toLowerCase() !== PHRASE}
              >
                {busy ? 'Deleting' : 'Delete account'}
              </button>
            )}
            <button
              type="button"
              className="text-ink-soft underline underline-offset-4"
              onClick={() => {
                setOpen(false)
                setTyped('')
                setError(null)
              }}
            >
              Keep my account
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
