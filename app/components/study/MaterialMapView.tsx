'use client'

import Link from 'next/link'
import type { IdeaView, MaterialView } from '../../lib/views'
import { Theo } from '../Theo'

// A material's skill map, drawn from its view and the page's state. It opens like a lesson: the chalkboard says what
// Lyceo found and holds the one button that matters. Below, each idea sits next to the page it comes from.

export type MaterialMapProps = {
  view: MaterialView | null
  error: string | null
  busy: string | null
  confirmDelete: boolean
  onRetry: () => void
  onDecide: (idea: IdeaView, keep: boolean) => void
  onStudy: () => void
  onAskDelete: (ask: boolean) => void
  onDelete: () => void
}

const pagesLabel = (pages: number[]) => {
  if (!pages.length) return null
  if (pages.length === 1) return `p. ${pages[0]}`
  const contiguous = pages.every((p, i) => i === 0 || p === pages[i - 1] + 1)
  return contiguous ? `pp. ${pages[0]}–${pages[pages.length - 1]}` : `pp. ${pages.join(', ')}`
}

export function MaterialMapView(p: MaterialMapProps) {
  if (!p.view) return null
  const m = p.view.material
  const flagged = p.view.ideas.filter((i) => i.flagged)

  return (
    <div className="mx-auto max-w-[46rem]">
      <p className="text-[0.95rem] text-ink-soft">
        {m.courseId ? (
          <Link href={`/courses/${m.courseId}`} className="text-ink-soft underline-offset-4 hover:underline">
            {m.courseName}
          </Link>
        ) : (
          'No course'
        )}
        {m.pageCount > 0 && ` · ${m.pageCount} ${m.pageCount === 1 ? 'page' : 'pages'}`}
      </p>
      <h1 className="mt-1 text-[clamp(1.9rem,3.6vw,2.6rem)]">{m.title}</h1>

      {m.status === 'failed' ? (
        <div role="alert" className="mt-8 border-l-2 border-terracotta pl-5">
          <p className="font-display text-[1.35rem]">Lyceo couldn’t use this file.</p>
          <p className="mt-1 max-w-[60ch] text-ink-soft">{m.failure ?? 'Try uploading it again.'}</p>
          <Link
            href={`/materials/new${m.courseId ? `?course=${m.courseId}` : ''}`}
            className="btn btn-quiet mt-5 no-underline"
          >
            Upload another file
          </Link>
        </div>
      ) : m.status !== 'mapped' ? (
        <div className="board mt-8 px-6 pb-12 pt-12 text-center sm:px-10" aria-live="polite">
          {p.error ? (
            <>
              <p role="alert" className="mx-auto max-w-[34ch] font-chalk text-[1.6rem] leading-snug text-chalk">
                {p.error}
              </p>
              <button type="button" className="btn btn-gold mt-6" onClick={p.onRetry}>
                Try again
              </button>
            </>
          ) : (
            <p className="flex items-center justify-center gap-3 font-chalk text-[1.7rem] text-chalk">
              <span className="spinner text-gold" aria-hidden="true" /> Finding the ideas in this material
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="relative mt-8">
            <div className="board flex flex-col items-center gap-6 px-6 pb-12 pt-12 text-center sm:px-10">
              <p className="max-w-[30ch] font-chalk text-[clamp(1.6rem,3.2vw,2.05rem)] leading-snug text-chalk">
                {p.view.headline}
              </p>
              <button
                type="button"
                className="btn btn-gold px-6 py-3 text-[1.05rem]"
                onClick={p.onStudy}
                disabled={p.busy !== null || !m.courseId}
              >
                {p.busy === 'study' ? (
                  <>
                    <span className="spinner" /> Writing your questions
                  </>
                ) : (
                  'Start studying'
                )}
              </button>
              <p className="max-w-[46ch] text-[0.92rem] text-chalk/75" aria-live="polite">
                {p.busy === 'study'
                  ? 'Theo is writing a short Quick Check from these pages. About half a minute.'
                  : flagged.length
                    ? `${flagged.length === 1 ? 'One idea needs' : `${flagged.length} ideas need`} a quick yes or no below. Starting accepts the map as it is.`
                    : 'A short Quick Check on these ideas, one question at a time.'}
              </p>
            </div>
            <Theo size={84} float={false} className="absolute -bottom-8 right-6" />
          </div>

          {p.error && (
            <p role="alert" className="mt-12 border-l-2 border-terracotta pl-4 text-terracotta">
              {p.error}
            </p>
          )}

          <ol className="mt-14 divide-y divide-line border-y border-line" aria-label="Ideas in this material">
            {p.view.ideas.map((idea) => (
              <li key={idea.sourceId} className="grid gap-x-4 py-6 sm:grid-cols-[4.75rem_1fr]">
                <span className="font-display text-[0.98rem] text-gold-deep sm:pt-1 sm:text-[1.05rem]">
                  {pagesLabel(idea.pages) ?? ''}
                </span>
                <div>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h2 className="font-display text-[1.3rem] leading-snug">{idea.name}</h2>
                    <span className="text-[0.85rem] text-ink-soft">
                      {idea.already ? 'Already in your course' : 'New'}
                    </span>
                  </div>
                  {idea.objective && <p className="mt-1 max-w-[60ch] text-[0.97rem] text-ink-soft">{idea.objective}</p>}
                  {idea.quote && (
                    <blockquote className="mt-3 max-w-[58ch] border-l-2 border-gold pl-4 font-display text-[1.05rem] italic leading-snug">
                      “{idea.quote}”
                    </blockquote>
                  )}
                  {idea.flagged && (
                    <div className="mt-4 rounded-xl bg-ivory-deep/70 px-4 py-3.5">
                      <p className="max-w-[58ch] text-[0.97rem]">
                        {idea.joined
                          ? `Found here as “${idea.joined.name}”. Lyceo thinks it’s the same idea as “${idea.name}”, already in your course.`
                          : 'No sentence in the material says this outright; Lyceo inferred it. Keep it?'}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn btn-quiet py-2"
                          disabled={p.busy !== null}
                          onClick={() => p.onDecide(idea, true)}
                        >
                          {idea.joined ? 'Same idea' : 'Keep it'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-quiet py-2"
                          disabled={p.busy !== null}
                          onClick={() => p.onDecide(idea, false)}
                        >
                          {idea.joined ? 'Keep them apart' : 'Remove it'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}

      <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-[0.92rem]">
        {m.courseId && (
          <Link href={`/courses/${m.courseId}`} className="text-ink-soft underline underline-offset-4">
            Back to {m.courseName}
          </Link>
        )}
        {p.confirmDelete ? (
          <span className="flex flex-wrap items-center gap-3">
            <span>Delete this file? Its ideas and your answers stay in the course.</span>
            <button type="button" className="btn btn-quiet py-2" onClick={p.onDelete} disabled={p.busy !== null}>
              {p.busy === 'delete' ? 'Deleting' : 'Delete'}
            </button>
            <button type="button" className="underline underline-offset-4" onClick={() => p.onAskDelete(false)}>
              Keep it
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="text-ink-soft underline underline-offset-4"
            onClick={() => p.onAskDelete(true)}
          >
            Delete this material
          </button>
        )}
      </div>
    </div>
  )
}
