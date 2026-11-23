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
  return src
    .split(/(\$\$[^$]+\$\$|\$[^$\n]+\$)/g)
    .map((part) => {
      if (part.length > 4 && part.startsWith('$$') && part.endsWith('$$'))
        return katex.renderToString(part.slice(2, -2), { throwOnError: false, displayMode: true })
      if (part.length > 2 && part.startsWith('$') && part.endsWith('$'))
        return katex.renderToString(part.slice(1, -1), { throwOnError: false })
      return emphasis(escapeHtml(part))
    })
    .join('')
}

export function renderDisplayMath(tex: string): string {
  return katex.renderToString(tex, { throwOnError: false, displayMode: true })
}
