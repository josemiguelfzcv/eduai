'use client'

import Link from 'next/link'
import { renderBoardLine } from '../../lib/math'
import { plainText } from '../../lib/text'
import type { SessionSummary } from '../../lib/study'
import type { SessionView } from '../../lib/views'
import { MathInline, MathText } from '../MathText'
import { Theo } from '../Theo'
import { Closure } from './Closure'

// The study session, drawn from the session view and the page's state. No data loading here: the page owns that, and
// a design preview can render every state from fixtures.
//
// The look follows the lesson player: questions sit on paper in the display serif, Theo explains on the chalkboard,
// and what comes from the student's own slides is set apart as a quoted slip with its page.

type Step = SessionView['steps'][number]
export type Result = { itemId: string; verdict: string; feedback: string | null; uncertain: boolean; dontKnow: boolean }
export type Busy = 'answer' | 'hint' | 'finish' | null

export type QuickCheckProps = {
  view: SessionView
  answer: string
  setAnswer: (text: string) => void
  clarify: string | null
  result: Result | null
  /** A missed question whose explanation is being written (or failed to be). */
  pending: string | null
  teachError: string | null
  busy: Busy
  closure: { summary: SessionSummary; paused: boolean } | null
  error: string | null
  onSubmit: (dontKnow?: boolean) => void
  onHint: () => void
  onContinue: () => void
  onRetryTeach: () => void
  onSkipTeach: () => void
  onFinish: (pause: boolean) => void
  onResume: () => void
}

const LETTERS = 'ABCDE'

export function QuickCheckView(p: QuickCheckProps) {
  const { view } = p
  const summary = p.closure?.summary ?? view.summary
  const steps = view.steps
  const questions = steps.filter((s) => s.item.type === 'question')
  const guided = view.session.mode === 'guided_review'
  const title = summary ? 'How it went' : guided ? 'Guided Review' : 'Quick Check'

  let body: React.ReactNode
  if (summary) {
    body = <SessionClosure summary={summary} paused={!!p.closure?.paused} onResume={p.onResume} />
  } else if (p.result) {
    const step = steps.find((s) => s.item.id === p.result!.itemId)
    const teachingNext = view.pendingTeach === p.result.itemId || steps.some((s) => s.item.follows === p.result!.itemId)
    body = step ? (
      <AnsweredQuestion
        step={step}
        number={questions.indexOf(step) + 1}
        total={questions.length}
        skill={view.skillNames[step.item.skill_id]}
        result={p.result}
        teachingNext={teachingNext}
        next={teachingNext ? 'See the explanation' : view.current ? 'Next question' : 'See how it went'}
        busy={p.busy}
        onContinue={p.onContinue}
      />
    ) : null
  } else if (p.pending) {
    body = <WritingExplanation error={p.teachError} onRetry={p.onRetryTeach} onSkip={p.onSkipTeach} />
  } else {
    const current = steps.find((s) => s.item.id === view.current)
    if (current) {
      // The explanation the student reads first: the item right before this question, if it is one.
      const before = steps[steps.indexOf(current) - 1]
      const explanation = before?.item.type === 'explanation' ? before : undefined
      body = (
        <div className="space-y-12">
          {explanation && <TheoExplains step={explanation} materials={view.materialTitles} />}
          <QuestionCard
            step={current}
            label={
              current.item.round ? 'New problem' : `Question ${questions.indexOf(current) + 1} of ${questions.length}`
            }
            skill={view.skillNames[current.item.skill_id]}
            {...p}
          />
        </div>
      )
    } else {
      body = (
        <section className="border-t border-line pt-8">
          <p className="font-display text-[1.6rem] leading-snug">That’s every question.</p>
          <button
            type="button"
            className="btn btn-primary mt-5"
            onClick={() => p.onFinish(false)}
            disabled={p.busy !== null}
          >
            {p.busy === 'finish' ? 'Closing' : 'See how it went'}
          </button>
        </section>
      )
    }
  }

  return (
    <div className="mx-auto max-w-[44rem]">
      <header>
        <div className="flex items-center justify-between gap-4">
          <p className="text-[0.95rem] text-ink-soft">
            {view.session.courseId ? (
              <Link
                href={`/courses/${view.session.courseId}`}
                className="text-ink-soft underline-offset-4 hover:underline"
              >
                {view.session.courseName}
              </Link>
            ) : (
              'Your course'
            )}
          </p>
          {!summary && view.session.status === 'active' && (
            <button
              type="button"
              className="text-[0.95rem] text-ink-soft underline underline-offset-4 hover:text-ink"
              onClick={() => p.onFinish(true)}
              disabled={p.busy !== null}
            >
              Stop for now
            </button>
          )}
        </div>
        <h1 className="mt-1 text-[clamp(1.9rem,3.6vw,2.6rem)]">{title}</h1>
        {!summary && <SessionProgress steps={questions} current={p.result ? p.result.itemId : view.current} />}
      </header>

      {p.error && (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-terracotta/40 bg-terracotta/5 px-4 py-3 text-terracotta"
        >
          {p.error}
        </p>
      )}
      <div className="mt-10">{body}</div>
    </div>
  )
}

/** One mark per question in the order the student meets them: right, partly, missed, now, or still to come. */
function SessionProgress({ steps, current }: { steps: Step[]; current: string | null }) {
  const answered = steps.filter((s) => s.answers.some((a) => a.final)).length
  return (
    <div className="mt-5">
      <ol className="flex gap-1.5" aria-label={`${answered} of ${steps.length} answered`}>
        {steps.map((s) => {
          const final = s.answers.find((a) => a.final)
          const tone = final
            ? final.verdict === 'correct'
              ? 'bg-moss'
              : final.verdict === 'partial'
                ? 'bg-gold'
                : final.verdict === 'incorrect'
                  ? 'bg-terracotta'
                  : 'bg-stone-deep'
            : s.item.id === current
              ? 'bg-gold'
              : 'bg-line'
          return <li key={s.item.id} className={`h-1.5 flex-1 rounded-full ${tone}`} />
        })}
      </ol>
      <p className="mt-2 text-[0.88rem] text-ink-soft" aria-hidden="true">
        {answered} of {steps.length} answered
      </p>
    </div>
  )
}

function QuestionPrompt({ label, skill, text }: { label: string; skill: string; text: string }) {
  return (
    <>
      <p className="text-[0.92rem] text-ink-soft">
        <span className="font-medium text-gold-deep">{label}</span>
        {skill && <> · {skill}</>}
      </p>
      <MathText
        text={text}
        className="mt-3 font-display text-[clamp(1.35rem,2.4vw,1.6rem)] leading-[1.35] text-ink [&_.katex]:text-[0.94em]"
      />
    </>
  )
}

function QuestionCard(p: QuickCheckProps & { step: Step; label: string; skill: string }) {
  const { step, busy } = p
  const { hints, hintsLeft } = p.view
  const item = step.item
  const disabled = busy !== null
  return (
    <section aria-label={p.label}>
      <QuestionPrompt label={p.label} skill={p.skill} text={item.prompt} />
      <form
        className="mt-7"
        onSubmit={(e) => {
          e.preventDefault()
          p.onSubmit(false)
        }}
      >
        {item.format === 'choice' && item.choices ? (
          <fieldset>
            <legend className="sr-only">Choose one answer</legend>
            <div className="overflow-hidden rounded-2xl border border-line bg-panel">
              {item.choices.map((choice, i) => {
                const letter = LETTERS[i]
                const picked = p.answer === letter
                return (
                  <label
                    key={letter}
                    className={`flex cursor-pointer items-start gap-4 border-b border-line px-5 py-4 transition-colors last:border-b-0 has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:-outline-offset-3 has-[:focus-visible]:outline-gold ${
                      picked ? 'bg-forest/[0.06]' : 'hover:bg-ivory/70'
                    }`}
                  >
                    <input
                      type="radio"
                      name={`choice-${item.id}`}
                      value={letter}
                      checked={picked}
                      onChange={() => p.setAnswer(letter)}
                      disabled={disabled}
                      className="sr-only"
                    />
                    <Letter letter={letter} state={picked ? 'picked' : 'idle'} />
                    <MathInline text={choice} className="pt-0.5 text-[1.02rem] [&_.katex]:text-[1em]" />
                  </label>
                )
              })}
            </div>
          </fieldset>
        ) : item.format === 'short_text' ? (
          <textarea
            className="field min-h-32 text-[1.02rem]"
            aria-label="Your answer"
            placeholder="Answer in a sentence or two"
            value={p.answer}
            onChange={(e) => p.setAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) p.onSubmit(false)
            }}
            disabled={disabled}
          />
        ) : (
          <label className="block">
            <span className="mb-2 block text-[0.92rem] text-ink-soft">Your answer</span>
            <input
              className="field max-w-[16rem] font-display text-[1.3rem]"
              inputMode={item.format === 'number' ? 'decimal' : 'text'}
              value={p.answer}
              onChange={(e) => p.setAnswer(e.target.value)}
              disabled={disabled}
              autoComplete="off"
            />
          </label>
        )}

        {hints.length > 0 && (
          <ol className="mt-6 space-y-3">
            {hints.map((h, i) => (
              <li key={i} className="border-l-2 border-gold pl-4 text-[0.98rem]">
                <span className="text-[0.88rem] font-medium text-gold-deep">Hint {i + 1}</span>
                <MathText text={h} className="mt-0.5" />
              </li>
            ))}
          </ol>
        )}
        {p.clarify && (
          <p role="alert" className="mt-6 border-l-2 border-gold pl-4">
            {p.clarify}
          </p>
        )}

        <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
          <button type="submit" className="btn btn-primary" disabled={disabled || !p.answer.trim()}>
            {busy === 'answer' ? (
              <>
                <span className="spinner" /> Checking
              </>
            ) : (
              'Check answer'
            )}
          </button>
          {hintsLeft > 0 && (
            <button
              type="button"
              className="text-[0.95rem] text-forest underline underline-offset-4 disabled:opacity-55"
              onClick={p.onHint}
              disabled={disabled}
            >
              {busy === 'hint' ? 'Getting a hint' : hints.length ? 'Another hint' : 'Show a hint'}
            </button>
          )}
          <button
            type="button"
            className="text-[0.95rem] text-ink-soft underline underline-offset-4 disabled:opacity-55"
            onClick={() => p.onSubmit(true)}
            disabled={disabled}
          >
            I don’t know yet
          </button>
        </div>
        {hintsLeft > 0 && hints.length === 0 && (
          <p className="mt-3 text-[0.85rem] text-ink-soft">
            Hints are fine to use. An answer after a hint counts as practice rather than proof.
          </p>
        )}
      </form>
    </section>
  )
}

function Letter({ letter, state }: { letter: string; state: 'idle' | 'picked' | 'right' | 'wrong' }) {
  const look = {
    idle: 'border-stone bg-panel text-gold-deep',
    picked: 'border-forest bg-forest text-ivory',
    right: 'border-moss bg-moss text-ivory',
    wrong: 'border-terracotta bg-terracotta text-ivory',
  }[state]
  return (
    <span
      aria-hidden="true"
      className={`grid size-8 shrink-0 place-items-center rounded-full border font-display text-[1.05rem] leading-none ${look}`}
    >
      {state === 'right' ? <Mark kind="right" /> : state === 'wrong' ? <Mark kind="wrong" /> : letter}
    </span>
  )
}

function Mark({ kind }: { kind: 'right' | 'wrong' }) {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      {kind === 'right' ? <path d="M3.5 8.5l3 3 6-7" /> : <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />}
    </svg>
  )
}

const VERDICT: Record<string, { title: string; tone: string; mark: 'right' | 'wrong' | null }> = {
  correct: { title: 'Right.', tone: 'text-moss', mark: 'right' },
  partial: { title: 'Partly right.', tone: 'text-gold-deep', mark: null },
  incorrect: { title: 'Not quite.', tone: 'text-terracotta', mark: 'wrong' },
  unclear: {
    title: 'That couldn’t be read as one answer, so it counts neither way.',
    tone: 'text-ink-soft',
    mark: null,
  },
}

/** The question just answered, with the right choice marked, the verdict, and the way on. */
function AnsweredQuestion(p: {
  step: Step
  number: number
  total: number
  skill: string
  result: Result
  teachingNext: boolean
  next: string
  busy: Busy
  onContinue: () => void
}) {
  const item = p.step.item
  const final = p.step.answers.find((a) => a.final)
  const v = VERDICT[p.result.verdict] ?? VERDICT.incorrect
  const correctLetter = p.result.verdict === 'correct' && final ? final.answer.trim().toUpperCase() : null
  const label = item.round ? 'New problem' : `Question ${p.number} of ${p.total}`
  return (
    <section aria-live="polite">
      <QuestionPrompt label={label} skill={p.skill} text={item.prompt} />
      {item.format === 'choice' && item.choices ? (
        <div className="mt-7 overflow-hidden rounded-2xl border border-line bg-panel">
          {item.choices.map((choice, i) => {
            const letter = LETTERS[i]
            const mine = final?.answer.trim().toUpperCase() === letter
            const state = mine ? (correctLetter ? 'right' : 'wrong') : 'idle'
            return (
              <div
                key={letter}
                className={`flex items-start gap-4 border-b border-line px-5 py-4 last:border-b-0 ${
                  state === 'right' ? 'bg-moss/[0.07]' : state === 'wrong' ? 'bg-terracotta/[0.06]' : 'opacity-70'
                }`}
              >
                <Letter letter={letter} state={state} />
                <MathInline text={choice} className="pt-0.5 text-[1.02rem]" />
              </div>
            )
          })}
        </div>
      ) : (
        !p.result.dontKnow &&
        final && (
          <p className="mt-6 text-[1.02rem]">
            <span className="text-ink-soft">Your answer: </span>
            <MathInline text={final.answer} />
          </p>
        )
      )}

      <div className="mt-8 border-t border-line pt-6">
        <p className={`flex items-center gap-2 font-display text-[1.5rem] ${v.tone}`}>
          {v.mark && !p.result.dontKnow && <Mark kind={v.mark} />}
          {p.result.dontKnow ? 'That’s fine. Here’s how it works.' : v.title}
        </p>
        {p.result.feedback && !p.result.dontKnow && (
          <MathText text={p.result.feedback} className="mt-2 max-w-[62ch] text-[1.02rem]" />
        )}
        {p.result.uncertain && (
          <p className="mt-2 text-[0.92rem] text-ink-soft">
            The grading of this answer was uncertain, so it counts neither way.
          </p>
        )}
        {final?.solution && !p.teachingNext && (
          <details className="mt-4" open={p.result.verdict !== 'correct'}>
            <summary className="cursor-pointer text-[0.95rem] text-forest underline underline-offset-4">
              How to solve it
            </summary>
            <MathText text={final.solution} className="mt-3 max-w-[62ch] border-l-2 border-line pl-4 text-[0.98rem]" />
          </details>
        )}
        <button type="button" className="btn btn-primary mt-7" disabled={p.busy !== null} onClick={p.onContinue}>
          {p.next}
        </button>
      </div>
    </section>
  )
}

/** Theo's explanation, on the chalkboard like in a lesson, and the slide it comes from set apart below. */
function TheoExplains({ step, materials }: { step: Step; materials: Record<number, string> }) {
  const source = step.item.sources?.[0]
  const where = source?.materialId ? materials[source.materialId] : null
  const lines = plainText(step.item.prompt).trim().split(/\n+/)
  return (
    <section aria-label="Explanation">
      <div className="relative">
        <div className="board px-6 pb-10 pt-11 sm:px-9">
          <p className="text-[0.88rem] font-medium tracking-[0.01em] text-gold">
            {step.item.round === 2 ? 'Another way to see it' : 'Here’s the idea'}
          </p>
          <div className="mt-3 space-y-3">
            {lines.map((line, i) => (
              <p
                key={i}
                className="board-line board-compact"
                style={{ fontSize: 'clamp(1.25rem, 2.2vw, 1.55rem)' }}
                dangerouslySetInnerHTML={{ __html: renderBoardLine(line) }}
              />
            ))}
          </div>
        </div>
        <Theo size={76} float={false} className="absolute -bottom-7 right-5" />
      </div>
      {source && (source.quote || source.pages?.length) && (
        <figure className="mt-10 max-w-[58ch] border-l-2 border-gold pl-4">
          {source.quote && (
            <blockquote className="font-display text-[1.12rem] italic leading-snug text-ink">
              “{source.quote}”
            </blockquote>
          )}
          <figcaption className="mt-1.5 text-[0.88rem] text-ink-soft">
            From {where ?? 'your material'}
            {source.pages?.length ? `, page ${source.pages[0]}` : ''}
          </figcaption>
        </figure>
      )}
    </section>
  )
}

function WritingExplanation(p: { error: string | null; onRetry: () => void; onSkip: () => void }) {
  return (
    <div className="board px-6 pb-10 pt-11 sm:px-9" aria-live="polite">
      {p.error ? (
        <>
          <p className="board-line board-compact" role="alert">
            {p.error}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" className="btn btn-gold" onClick={p.onRetry}>
              Try again
            </button>
            <button
              type="button"
              className="btn border border-chalk/40 text-chalk hover:border-chalk/70"
              onClick={p.onSkip}
            >
              Go on without it
            </button>
          </div>
        </>
      ) : (
        <p className="board-line board-compact flex items-center gap-3">
          <span className="spinner text-gold" aria-hidden="true" /> Theo is writing an explanation from your slides, and
          a new problem to try.
        </p>
      )}
    </div>
  )
}

/** The closure: the day's headline in chalk, then what happened, how each skill moved and tomorrow's step. */
function SessionClosure(p: { summary: SessionSummary; paused: boolean; onResume: () => void }) {
  return (
    <div>
      <Closure summary={p.summary} />
      <div className="mt-12 flex flex-wrap gap-3">
        {p.paused && (
          <button type="button" className="btn btn-primary" onClick={p.onResume}>
            Keep going
          </button>
        )}
        <Link href="/dashboard" className={`btn ${p.paused ? 'btn-quiet' : 'btn-primary'} no-underline`}>
          Back to My Academy
        </Link>
      </div>
    </div>
  )
}
