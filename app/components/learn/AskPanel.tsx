'use client'

import { useEffect, useRef, useState } from 'react'
import { clockBody } from '../../lib/clock'
import type { LessonMessage } from '../../lib/views'
import { deleteJSON } from '../../lib/supabase'
import { ChatIcon, CloseIcon, MoreIcon, PersonIcon, PlusIcon, SendIcon } from './icons'
import { LaurelMark } from './LaurelMark'
import { RichText } from './LessonDocument'
import { postStream } from './stream'

// Ask Lyceo: a conversation beside the lesson. Asking never moves the lesson; the conversation scrolls on its own and
// is kept per lecture. A question can carry a passage of the lesson (selected, or a box's "Ask about this").

/** What a question is about: a section of the lesson, or a passage quoted from it. */
export type AskContext = { sectionId?: string; quote?: string }

type Props = {
  lectureId: number
  initial: LessonMessage[]
  context: AskContext | null
  setContext: (c: AskContext | null) => void
  /** The lesson's section titles by id, to name what a question was about. */
  titles: Record<string, string>
  /** The section at the top of the lesson right now, for the + button (null without a lesson). */
  reading: (() => string | null) | null
  onClose: () => void
}

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

export function AskPanel({ lectureId, initial, context, setContext, titles, reading, onClose }: Props) {
  const [messages, setMessages] = useState<LessonMessage[]>(initial)
  const [draft, setDraft] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const busy = answer !== null

  // Keep the newest message in view.
  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages, answer])

  // A passage to ask about: put the cursor in the box.
  useEffect(() => {
    if (context) inputRef.current?.focus({ preventScroll: true })
  }, [context])

  const send = async () => {
    const message = draft.trim()
    if (!message || busy) return
    const asked: LessonMessage = {
      id: -Date.now(),
      role: 'student',
      content: message,
      context:
        context && (context.sectionId || context.quote) ? { sectionId: context.sectionId, quote: context.quote } : null,
      createdAt: new Date().toISOString(),
    }
    setMessages((m) => [...m, asked])
    setDraft('')
    setContext(null)
    setError(null)
    setAnswer('')
    try {
      const text = await postStream(
        `/api/lectures/${lectureId}/ask`,
        { message, context: asked.context, ...clockBody() },
        (t) => setAnswer(t),
      )
      setMessages((m) => [
        ...m,
        { id: -Date.now(), role: 'lyceo', content: text, context: null, createdAt: new Date().toISOString() },
      ])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lyceo could not answer. Try again.')
    } finally {
      setAnswer(null)
    }
  }

  const clear = async () => {
    setMenu(false)
    try {
      await deleteJSON(`/api/lectures/${lectureId}/messages`)
      setMessages([])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not clear the conversation.')
    }
  }

  return (
    <section aria-labelledby="ask-title" className="flex h-full flex-col">
      <header className="border-b border-[#eadfcd] px-5 pb-4 pt-[18px]">
        <div className="flex items-center gap-3">
          <span className="text-[#1d1c19]">
            <ChatIcon size={26} />
          </span>
          <h2
            id="ask-title"
            className="min-w-0 flex-1 font-display text-[1.72rem] font-bold leading-tight tracking-[-0.015em] text-[#1d1c19]"
          >
            Ask Lyceo
          </h2>
          <div className="relative flex items-center">
            <button
              type="button"
              onClick={() => setMenu((v) => !v)}
              aria-label="Conversation options"
              aria-haspopup="menu"
              aria-expanded={menu}
              className="grid size-9 place-items-center rounded-lg text-[#3e3d36] hover:bg-ink/[0.05] hover:text-ink"
            >
              <MoreIcon size={20} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Ask Lyceo"
              className="grid size-9 place-items-center rounded-lg text-[#3e3d36] hover:bg-ink/[0.05] hover:text-ink"
            >
              <CloseIcon size={19} />
            </button>
            {menu && (
              <div
                role="menu"
                className="absolute right-0 top-10 z-10 w-56 rounded-xl border border-line bg-panel py-1.5 shadow-xl"
              >
                <button
                  role="menuitem"
                  type="button"
                  onClick={clear}
                  disabled={!messages.length || busy}
                  className="block w-full px-4 py-2 text-left text-[0.9rem] hover:bg-ivory disabled:opacity-50"
                >
                  Clear this conversation
                </button>
              </div>
            )}
          </div>
        </div>
        <p className="mt-1 pl-[38px] text-[0.84rem] leading-snug text-[#55544d]">
          A course assistant for quick questions, clarifications, and deeper dives.
        </p>
      </header>

      <div
        ref={listRef}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5"
        aria-live="polite"
      >
        {messages.length === 0 && answer === null && (
          <div className="rounded-2xl border border-dashed border-[#e2d7c3] px-4 py-5 text-[0.88rem] leading-relaxed text-ink-soft">
            Ask anything about this lecture. To ask about a passage, select it in the lesson, or use “Ask about this” on
            a box.
          </div>
        )}
        {messages.map((m) =>
          m.role === 'student' ? (
            <StudentMessage key={m.id} m={m} titles={titles} />
          ) : (
            <LyceoMessage key={m.id} text={m.content} at={m.createdAt} />
          ),
        )}
        {answer !== null && <LyceoMessage text={answer} at={null} pending={!answer} />}
        {error && (
          <p role="alert" className="text-[0.92rem] text-terracotta">
            {error}
          </p>
        )}
      </div>

      <div className="px-4 pb-4 pt-2">
        {context && (
          <div className="mb-2 flex items-start gap-2 rounded-xl bg-sage/70 px-3 py-2 text-[0.8rem] text-grove">
            <span className="line-clamp-2 min-w-0 flex-1">
              <About context={context} titles={titles} />
            </span>
            <button
              type="button"
              onClick={() => setContext(null)}
              aria-label="Remove the passage"
              className="shrink-0 rounded p-0.5 hover:bg-forest/10"
            >
              <CloseIcon size={15} />
            </button>
          </div>
        )}
        <form
          className="flex items-end gap-1.5 rounded-[16px] border border-[#e6dac6] bg-[#fffaf3] p-1.5 shadow-[0_2px_10px_-6px_rgba(90,60,20,0.25)] focus-within:border-grove/40"
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
        >
          <button
            type="button"
            disabled={!reading || busy}
            onClick={() => {
              const sectionId = reading?.()
              if (sectionId) setContext({ sectionId })
            }}
            title="Ask about the section you're reading"
            aria-label="Ask about the section you're reading"
            className="grid size-10 shrink-0 place-items-center rounded-xl text-[#1d1c19] hover:bg-ink/[0.05] disabled:opacity-40"
          >
            <PlusIcon size={21} />
          </button>
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder="Ask a follow-up question..."
            aria-label="Your question"
            className="max-h-[140px] min-h-10 flex-1 resize-none bg-transparent px-1 py-2.5 text-[0.88rem] outline-none placeholder:text-[#6d6b62]"
          />
          <button
            type="submit"
            disabled={!draft.trim() || busy}
            aria-label="Send"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-grove text-ivory transition-colors hover:bg-grove-soft disabled:cursor-default disabled:bg-grove/80"
          >
            <SendIcon size={18} />
          </button>
        </form>
      </div>
    </section>
  )
}

/** A quoted passage as words to read: without the lesson's markup. */
const readable = (quote: string) =>
  quote
    .replace(/\$\$?([^$]*)\$\$?/g, '$1')
    .replace(/\*\*?([^*]+)\*\*?/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()

/** Names what a question is about: the quoted passage, or the section. */
function About({ context, titles }: { context: AskContext; titles: Record<string, string> }) {
  if (context.quote)
    return (
      <>
        <span className="font-medium">About </span>
        <span className="italic">“{readable(context.quote)}”</span>
      </>
    )
  const title = context.sectionId ? titles[context.sectionId] : undefined
  return (
    <>
      <span className="font-medium">About the section </span>
      <span className="italic">{title ? `“${title}”` : 'you’re reading'}</span>
    </>
  )
}

function StudentMessage({ m, titles }: { m: LessonMessage; titles: Record<string, string> }) {
  return (
    <div>
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-[#ebe6d5] text-[#3e3d36]">
          <PersonIcon size={19} />
        </span>
        <div className="min-w-0 flex-1 rounded-[14px] bg-sage px-4 py-2.5 text-[0.86rem] leading-[1.45] text-[#1d1c19]">
          {m.context && (m.context.quote || m.context.sectionId) && (
            <p className="mb-1.5 line-clamp-3 border-l-2 border-grove/30 pl-2.5 text-[0.8rem] text-[#4b4a42]">
              <About context={m.context} titles={titles} />
            </p>
          )}
          <p className="whitespace-pre-wrap">{m.content}</p>
        </div>
      </div>
      <p className="mt-1 text-right text-[0.7rem] text-[#6d6b62]">{time(m.createdAt)}</p>
    </div>
  )
}

function LyceoMessage({ text, at, pending = false }: { text: string; at: string | null; pending?: boolean }) {
  return (
    <div>
      <div className="flex items-start gap-2.5">
        <span className="mt-2 grid w-9 shrink-0 place-items-center text-grove">
          <LaurelMark size={30} />
        </span>
        <div className="min-w-0 flex-1 rounded-[14px] border border-[#eee4d4] bg-[#fffbf6] px-4 py-3 shadow-[0_1px_3px_rgba(80,60,30,0.06)]">
          <p className="text-[0.84rem] font-semibold text-[#1d1c19]">Lyceo</p>
          <div className="mt-1 font-display text-[0.89rem] leading-[1.42] text-[#24231f]">
            {pending ? (
              <p className="flex items-center gap-2 font-sans text-[0.84rem] text-ink-soft">
                <span className="spinner" aria-hidden="true" /> Thinking
              </p>
            ) : (
              <RichText text={text} />
            )}
          </div>
        </div>
      </div>
      {at && <p className="mt-1 text-right text-[0.7rem] text-[#6d6b62]">{time(at)}</p>}
    </div>
  )
}
