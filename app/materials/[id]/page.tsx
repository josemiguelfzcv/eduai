'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppShell, LoadingNote, useRequiredUser } from '../../components/AppShell'
import { startQuickCheck } from '../../components/study/client'
import type { IdeaView, MaterialView } from '../../lib/views'
import { deleteJSON, getJSON, postJSON } from '../../lib/supabase'

const pagesLabel = (pages: number[]) => {
  if (!pages.length) return null
  if (pages.length === 1) return `Page ${pages[0]}`
  const contiguous = pages.every((p, i) => i === 0 || p === pages[i - 1] + 1)
  return contiguous ? `Pages ${pages[0]}–${pages[pages.length - 1]}` : `Pages ${pages.join(', ')}`
}

/** A material's skill map: every idea with its page, and a yes or no only for what Lyceo wasn't sure of. */
export default function MaterialMap() {
  const user = useRequiredUser()
  const router = useRouter()
  const id = Number(useParams<{ id: string }>().id)
  const [view, setView] = useState<MaterialView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const mapping = useRef(false)

  const show = useCallback(async (next: MaterialView) => {
    setView(next)
    setError(null)
    // Text read but no map yet (an earlier attempt was interrupted): write it now.
    if (next.material.status === 'extracted' && !mapping.current) {
      mapping.current = true
      try {
        setView(await postJSON<MaterialView>(`/api/materials/${next.material.id}/map`, {}))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not find the ideas.')
      } finally {
        mapping.current = false
      }
    }
  }, [])

  useEffect(() => {
    if (user) getJSON<MaterialView>(`/api/materials/${id}`).then(show, (e) => setError(e.message))
  }, [user, id, show])

  const decide = async (idea: IdeaView, keep: boolean) => {
    setBusy(`idea-${idea.sourceId}`)
    try {
      setView(await postJSON<MaterialView>(`/api/materials/${id}/decide`, { sourceId: idea.sourceId, keep }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that.')
    } finally {
      setBusy(null)
    }
  }

  const study = async () => {
    if (!view?.material.courseId) return
    setBusy('study')
    setError(null)
    try {
      await postJSON(`/api/materials/${id}/accept`, {})
      const sessionId = await startQuickCheck({ courseId: view.material.courseId, materialId: id })
      router.push(`/sessions/${sessionId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the Quick Check.')
      setBusy(null)
    }
  }

  const remove = async () => {
    setBusy('delete')
    try {
      await deleteJSON(`/api/materials/${id}`)
      router.push(view?.material.courseId ? `/courses/${view.material.courseId}` : '/dashboard')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete it.')
      setBusy(null)
    }
  }

  if (!view) {
    return (
      <AppShell>
        {error ? (
          <div role="alert" className="panel p-6">
            <p>{error}</p>
            <Link href="/dashboard" className="btn btn-quiet mt-4 no-underline">
              Back to My Academy
            </Link>
          </div>
        ) : (
          <LoadingNote>Opening the material</LoadingNote>
        )}
      </AppShell>
    )
  }

  const m = view.material
  const flagged = view.ideas.filter((i) => i.flagged)

  return (
    <AppShell>
      <p className="text-[0.95rem] text-ink-soft">
        {m.courseId ? (
          <Link href={`/courses/${m.courseId}`} className="text-ink-soft underline underline-offset-4">
            {m.courseName}
          </Link>
        ) : (
          'No course'
        )}
        {m.pageCount > 0 && ` · ${m.pageCount} ${m.pageCount === 1 ? 'page' : 'pages'}`}
      </p>
      <h1 className="mt-1 text-[clamp(1.9rem,3.6vw,2.6rem)]">{m.title}</h1>

      {m.status === 'failed' ? (
        <div role="alert" className="panel mt-8 max-w-2xl p-6">
          <p className="font-display text-[1.3rem]">Lyceo couldn’t use this file.</p>
          <p className="mt-1 text-ink-soft">{m.failure ?? 'Try uploading it again.'}</p>
          <Link
            href={`/materials/new${m.courseId ? `?course=${m.courseId}` : ''}`}
            className="btn btn-quiet mt-4 no-underline"
          >
            Upload another file
          </Link>
        </div>
      ) : m.status !== 'mapped' ? (
        <div className="panel mt-8 max-w-2xl p-6" aria-live="polite">
          {error ? (
            <>
              <p role="alert">{error}</p>
              <button
                type="button"
                className="btn btn-quiet mt-4"
                onClick={() => getJSON<MaterialView>(`/api/materials/${id}`).then(show, (e) => setError(e.message))}
              >
                Try again
              </button>
            </>
          ) : (
            <p className="flex items-center gap-3">
              <span className="spinner" aria-hidden="true" /> Finding the ideas in this material
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="mt-6 flex max-w-3xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-display text-[1.35rem] leading-snug">{view.headline}</p>
            <button
              type="button"
              className="btn btn-primary shrink-0 self-start"
              onClick={study}
              disabled={busy !== null || !m.courseId}
            >
              {busy === 'study' ? (
                <>
                  <span className="spinner" /> Writing your questions
                </>
              ) : (
                'Start studying'
              )}
            </button>
          </div>
          {busy === 'study' && (
            <p className="mt-2 text-[0.9rem] text-ink-soft" aria-live="polite">
              Theo is writing a short Quick Check from these pages. This takes about half a minute.
            </p>
          )}
          {flagged.length > 0 && busy !== 'study' && (
            <p className="mt-3 max-w-[62ch] text-[0.95rem] text-ink-soft">
              {flagged.length === 1
                ? 'One idea needs a quick yes or no. Starting accepts it as it is.'
                : `${flagged.length} ideas need a quick yes or no. Starting accepts them as they are.`}
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="mt-4 max-w-3xl rounded-xl border border-terracotta/40 bg-terracotta/5 px-4 py-3 text-terracotta"
            >
              {error}
            </p>
          )}

          <ul className="mt-8 max-w-3xl space-y-3">
            {view.ideas.map((idea) => (
              <li key={idea.sourceId} className={`panel p-5 ${idea.flagged ? 'border-gold/70' : ''}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h2 className="font-display text-[1.25rem] leading-snug">{idea.name}</h2>
                  <span className="text-[0.85rem] text-ink-soft">
                    {[pagesLabel(idea.pages), idea.already ? 'Already in your course' : 'New']
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
                {idea.objective && <p className="mt-1 text-[0.95rem] text-ink-soft">{idea.objective}</p>}
                {idea.quote && (
                  <blockquote className="mt-3 border-l-2 border-gold pl-3 text-[0.95rem] italic text-ink">
                    “{idea.quote}”
                  </blockquote>
                )}
                {idea.flagged && (
                  <div className="mt-4 rounded-xl bg-ivory-deep/60 px-4 py-3">
                    <p className="text-[0.95rem]">
                      {idea.joined
                        ? `Found here as “${idea.joined.name}”. Lyceo thinks it’s the same idea as “${idea.name}”, already in your course.`
                        : 'No sentence in the material says this outright; Lyceo inferred it. Keep it?'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn btn-quiet"
                        disabled={busy !== null}
                        onClick={() => decide(idea, true)}
                      >
                        {idea.joined ? 'Same idea' : 'Keep it'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-quiet"
                        disabled={busy !== null}
                        onClick={() => decide(idea, false)}
                      >
                        {idea.joined ? 'Keep them apart' : 'Remove it'}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-10 flex max-w-3xl flex-wrap items-center gap-4 border-t border-line pt-6 text-[0.92rem]">
        {m.courseId && (
          <Link href={`/courses/${m.courseId}`} className="text-ink-soft underline underline-offset-4">
            Back to {m.courseName}
          </Link>
        )}
        {confirmDelete ? (
          <span className="flex flex-wrap items-center gap-3">
            <span>Delete this file? Its ideas and your answers stay in the course.</span>
            <button type="button" className="btn btn-quiet" onClick={remove} disabled={busy !== null}>
              {busy === 'delete' ? 'Deleting' : 'Delete'}
            </button>
            <button type="button" className="underline underline-offset-4" onClick={() => setConfirmDelete(false)}>
              Keep it
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="text-ink-soft underline underline-offset-4"
            onClick={() => setConfirmDelete(true)}
          >
            Delete this material
          </button>
        )}
      </div>
    </AppShell>
  )
}
