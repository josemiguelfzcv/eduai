'use client'

import { useMemo } from 'react'
import { renderBoardLine } from '../lib/math'

/** The chalkboard. Lines appear one at a time as Theo talks; hidden lines keep their space. */
export function Board({
  lines,
  revealed,
  className = '',
  children,
}: {
  lines: string[]
  revealed: number
  className?: string
  children?: React.ReactNode
}) {
  const html = useMemo(() => lines.map(renderBoardLine), [lines])

  return (
    <div className={`board flex flex-col justify-center px-6 pb-8 pt-10 sm:px-10 ${className}`}>
      <div className="flex flex-col gap-2">
        {html.map((h, i) => (
          <div
            key={`${i}-${lines[i]}`}
            className={`board-line ${i < revealed ? 'chalk-in' : 'invisible'}`}
            dangerouslySetInnerHTML={{ __html: h }}
          />
        ))}
      </div>
      {children}
    </div>
  )
}
