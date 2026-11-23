'use client'

import { renderDisplayMath, renderInline } from '../../lib/lesson-render'
import { blockText, parseSection, splitDisplayMath, type Block, type BoxKind } from '../../lib/written-lesson'
import { BookIcon, ChatIcon, ClipboardIcon, QuoteIcon, SparkleIcon } from './icons'

// Drawing a written lesson: prose in the reading serif, formulas set apart in quiet frames, and boxes for
// definitions, results and worked examples, each example with its takeaways beside it. Every leaf block carries its
// id (data-block) so the reading position can point at it.

/** Asks Lyceo about a section, or about a passage of it when `quote` is given. */
export type AskAbout = (context: { sectionId: string; quote?: string }) => void

/** The lesson's reading text: the serif at a comfortable size and leading, in lines of a readable length. */
const PROSE = 'lesson-text max-w-[38rem] font-display text-[0.98rem] leading-[1.62] text-[#24231f]'

const BOX: Record<BoxKind, { label: string; icon: React.ComponentType<{ size?: number }> }> = {
  definition: { label: 'Definition', icon: BookIcon },
  theorem: { label: 'Result', icon: BookIcon },
  example: { label: 'Example', icon: ClipboardIcon },
  note: { label: 'Watch out', icon: QuoteIcon },
  takeaways: { label: 'Key takeaways', icon: SparkleIcon },
  practice: { label: 'Try it', icon: ClipboardIcon },
}

/** Hidden until hovered or focused where there's a mouse; always shown on touch screens. */
const REVEAL =
  'opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/box:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100'

export function Blocks({
  blocks,
  sectionId,
  onAsk,
  compact = false,
}: {
  blocks: Block[]
  sectionId: string
  onAsk?: AskAbout
  compact?: boolean
}) {
  const leaf = (id: string) => (compact ? {} : { 'data-block': id, 'data-section': sectionId })
  return (
    <>
      {blocks.map((b) => {
        switch (b.type) {
          case 'paragraph':
            return (
              <p
                key={b.id}
                {...leaf(b.id)}
                className={compact ? 'lesson-text' : PROSE}
                dangerouslySetInnerHTML={{ __html: renderInline(b.text) }}
              />
            )
          case 'heading':
            return (
              <h3
                key={b.id}
                {...leaf(b.id)}
                className={
                  compact
                    ? 'font-sans text-[0.95em] font-semibold'
                    : 'pt-1 font-display text-[1.14rem] font-semibold text-[#24231f]'
                }
                dangerouslySetInnerHTML={{ __html: renderInline(b.text) }}
              />
            )
          case 'list': {
            const List = b.ordered ? 'ol' : 'ul'
            return (
              <List
                key={b.id}
                {...leaf(b.id)}
                className={`${b.ordered ? 'list-decimal' : 'list-disc'} space-y-1 pl-5 marker:text-[#8a7a5a] ${
                  compact ? 'lesson-text' : PROSE
                }`}
              >
                {b.items.map((item, i) => (
                  <li key={i} className="pl-1" dangerouslySetInnerHTML={{ __html: renderInline(item) }} />
                ))}
              </List>
            )
          }
          case 'math':
            return (
              <div
                key={b.id}
                {...leaf(b.id)}
                className={`flex flex-wrap justify-center gap-3 ${compact ? 'py-0.5' : 'py-1'}`}
              >
                {splitDisplayMath(b.tex).map((tex, i) => (
                  <div
                    key={i}
                    className="lesson-math max-w-full overflow-x-auto rounded-[10px] border border-[#ecdfca] bg-[#f8efe1] px-3.5 py-1.5"
                    dangerouslySetInnerHTML={{ __html: renderDisplayMath(tex) }}
                  />
                ))}
              </div>
            )
          case 'box':
            return compact ? (
              <div key={b.id} className="space-y-2 border-l-2 border-gold/60 pl-3">
                {b.title && <p className="font-sans text-[0.92em] font-semibold">{b.title}</p>}
                <Blocks blocks={b.blocks} sectionId={sectionId} compact />
              </div>
            ) : (
              <LessonBox key={b.id} box={b} sectionId={sectionId} onAsk={onAsk} />
            )
        }
      })}
    </>
  )
}

function LessonBox({
  box,
  sectionId,
  onAsk,
}: {
  box: Extract<Block, { type: 'box' }>
  sectionId: string
  onAsk?: AskAbout
}) {
  const look = BOX[box.kind]
  const Icon = look.icon
  const title = box.title ?? look.label
  const example = box.kind === 'example' || box.kind === 'practice'
  return (
    <section
      className={`group/box overflow-hidden rounded-[14px] border ${
        box.kind === 'note' ? 'border-gold/45' : 'border-[#e9dfcd]'
      }`}
      aria-label={title}
    >
      <header
        data-block={box.id}
        data-section={sectionId}
        className={`flex items-center gap-2.5 px-4 py-2.5 ${box.kind === 'note' ? 'bg-gold/[0.12]' : 'bg-parchment'}`}
      >
        <span className="text-[#3b3426]">
          <Icon size={18} />
        </span>
        <h3
          className="flex-1 font-sans text-[0.78rem] font-semibold uppercase leading-snug tracking-[0.1em] text-[#3b3426]"
          dangerouslySetInnerHTML={{ __html: renderInline(title) }}
        />
        {onAsk && (
          <button
            type="button"
            onClick={() => onAsk({ sectionId, quote: blockText({ ...box, title }).slice(0, 1200) })}
            aria-label={`Ask about this: ${title}`}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 font-sans text-[0.78rem] font-medium text-grove hover:bg-grove/[0.07] sm:px-2.5 sm:py-0.5 ${REVEAL}`}
          >
            <ChatIcon size={16} />
            <span className="hidden sm:inline">Ask about this</span>
          </button>
        )}
      </header>
      <div
        className={`grid gap-4 px-5 py-4 ${example ? 'bg-[#fffaf3]' : 'bg-[#fcf5ea]'} ${
          box.aside ? 'md:grid-cols-[minmax(0,1fr)_minmax(11rem,13.5rem)]' : ''
        }`}
      >
        <div className="min-w-0 space-y-3">
          <Blocks blocks={box.blocks} sectionId={sectionId} onAsk={onAsk} />
        </div>
        {box.aside?.type === 'box' && (
          <aside
            className="self-start rounded-[10px] border border-[#eadcc3] bg-[#f6ecdb] px-3.5 py-3"
            aria-label={box.aside.title ?? 'Key takeaways'}
          >
            <p className="flex items-center gap-1.5 font-sans text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#3b3426]">
              <span className="text-gold">
                <SparkleIcon size={15} />
              </span>
              {box.aside.title ?? 'Key takeaways'}
            </p>
            <div className="mt-2 space-y-1.5 font-sans text-[0.78rem] leading-snug text-[#2e2c26] [&_li]:pl-0">
              <Blocks blocks={box.aside.blocks} sectionId={sectionId} compact />
            </div>
          </aside>
        )}
      </div>
    </section>
  )
}

/** A section's text drawn whole (or as far as it has arrived). */
export function SectionBody({ sectionId, text, onAsk }: { sectionId: string; text: string; onAsk?: AskAbout }) {
  return (
    <div className="space-y-4">
      <Blocks blocks={parseSection(sectionId, text)} sectionId={sectionId} onAsk={onAsk} />
    </div>
  )
}

/** Markdown-ish text for Ask Lyceo's answers: paragraphs, lists and formulas, without reading anchors. */
export function RichText({ text }: { text: string }) {
  return (
    <div className="space-y-2">
      <Blocks blocks={parseSection('chat', text)} sectionId="chat" compact />
    </div>
  )
}
