'use client'

import { renderBoardLine } from '../lib/math'
import { plainText } from '../lib/text'

/** Text with LaTeX between $...$, in paragraphs. renderBoardLine escapes everything that isn't math. */
export function MathText({ text, className }: { text: string; className?: string }) {
  const paragraphs = plainText(text)
    .trim()
    .split(/\n{2,}/)
  return (
    <div className={className}>
      {paragraphs.map((p, i) => (
        <p
          key={i}
          className={i ? 'mt-3' : undefined}
          dangerouslySetInnerHTML={{ __html: p.split('\n').map(renderBoardLine).join('<br>') }}
        />
      ))}
    </div>
  )
}

/** One line of text with math, inline. */
export function MathInline({ text, className }: { text: string; className?: string }) {
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: renderBoardLine(plainText(text).replace(/\s*\n\s*/g, ' ')) }}
    />
  )
}
