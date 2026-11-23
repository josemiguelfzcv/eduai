import katex from 'katex'

// Inline text of a written lesson or an Ask Lyceo answer, as safe HTML: everything is escaped, then **bold**,
// *italic* and $math$ are drawn. Display math ($$...$$ on its own lines) is a block of its own (renderDisplayMath).

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const emphasis = (html: string) =>
  html
    .replace(/\*\*(\S(?:[^*]*?\S)?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(\S(?:[^*]*?\S)?)\*(?![*\w])/g, '$1<em>$2</em>')

export function renderInline(src: string): string {
  const parts = src.split(/(\$\$[^$]+\$\$|\$[^$\n]+\$)/g)
  return parts
    .map((part, i) => {
      if (part.length > 4 && part.startsWith('$$') && part.endsWith('$$'))
        return katex.renderToString(part.slice(2, -2), { throwOnError: false, displayMode: true })
      if (part.length > 2 && part.startsWith('$') && part.endsWith('$')) {
        // Punctuation right after a formula stays on its line.
        const html = katex.renderToString(part.slice(1, -1), { throwOnError: false })
        const stuck = /^[.,;:!?)\]]+/.exec(parts[i + 1] ?? '')?.[0]
        if (!stuck) return html
        parts[i + 1] = parts[i + 1].slice(stuck.length)
        return `<span class="whitespace-nowrap">${html}${escapeHtml(stuck)}</span>`
      }
      return emphasis(escapeHtml(part))
    })
    .join('')
}

export function renderDisplayMath(tex: string): string {
  return katex.renderToString(tex, { throwOnError: false, displayMode: true })
}
