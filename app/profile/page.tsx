'use client'

import { useEffect, useState } from 'react'
import { AppShell, LoadingNote, useRequiredUser } from '../components/AppShell'
import { LEARNING_STYLES, MAJORS, normalizeMajor } from '../lib/learning-styles'
import { supabase } from '../lib/supabase'

export default function Profile() {
  const user = useRequiredUser()
  const [loaded, setLoaded] = useState(false)
  const [major, setMajor] = useState('')
  const [style, setStyle] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  useEffect(() => {
    if (!user) return
    supabase
      .from('users')
      .select('career, learning_style')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        setMajor(normalizeMajor(data?.career) ?? '')
        setStyle(data?.learning_style ?? '')
        setLoaded(true)
      })
  }, [user])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setStatus('saving')
    const { error } = await supabase.from('users').upsert({
      id: user.id,
      email: user.email,
      name: user.user_metadata?.full_name,
      career: major || null,
      learning_style: style || null,
    })
    setStatus(error ? 'error' : 'saved')
  }

  const majors = major && !MAJORS.includes(major) ? [major, ...MAJORS] : MAJORS

  return (
    <AppShell>
      <h1 className="text-[clamp(1.9rem,3.6vw,2.6rem)]">How Theo teaches you</h1>
      <p className="mt-3 max-w-[60ch] text-ink-soft">
        Theo uses this, together with how you do on check-ins, every time he writes a lesson for you.
      </p>

      {!loaded ? (
        <div className="mt-8">
          <LoadingNote>Loading your profile</LoadingNote>
        </div>
      ) : (
        <form onSubmit={save} className="mt-8 max-w-2xl space-y-8" onChange={() => setStatus('idle')}>
          <div>
            <label htmlFor="major" className="mb-2 block font-bold">
              Your major
            </label>
            <p className="mb-3 text-ink-soft">Theo picks examples from your field when they fit.</p>
            <select id="major" className="field" value={major} onChange={(e) => setMajor(e.target.value)}>
              <option value="">Choose your major</option>
              {majors.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <fieldset>
            <legend className="mb-2 font-bold">How you like things explained</legend>
            <p className="mb-3 text-ink-soft">
              When an explanation doesn&apos;t land, Theo switches to a different approach on his own.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {LEARNING_STYLES.map((s) => (
                <label
                  key={s.id}
                  className={`cursor-pointer rounded-xl border-2 p-4 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-gold ${
                    style === s.id ? 'border-aegean bg-aegean/5' : 'border-line bg-[#fffdf8] hover:border-ink-soft'
                  }`}
                >
                  <input
                    type="radio"
                    name="style"
                    value={s.id}
                    checked={style === s.id}
                    onChange={() => setStyle(s.id)}
                    className="sr-only"
                  />
                  <span className="block font-bold">{s.label}</span>
                  <span className="mt-1 block text-[0.95rem] text-ink-soft">{s.description}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex items-center gap-4">
            <button type="submit" className="btn btn-primary px-6" disabled={status === 'saving'}>
              {status === 'saving' ? 'Saving' : 'Save'}
            </button>
            {status === 'saved' && <p className="text-teal">Saved. Your next lesson will use this.</p>}
            {status === 'error' && <p className="text-terracotta">Couldn&apos;t save. Check your connection and try again.</p>}
          </div>
        </form>
      )}
    </AppShell>
  )
}
