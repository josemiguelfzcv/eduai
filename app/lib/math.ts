import katex from 'katex'

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/**
 * Renders a board line: plain text with LaTeX between $...$ (inline) or $$...$$ (display).
 * Text is escaped, so the result is safe to inject.
 */
export function renderBoardLine(src: string): string {
  return src
    .split(/(\$\$[^$]+\$\$|\$[^$\n]+\$)/g)
    .map((part) => {
      if (part.length > 4 && part.startsWith('$$') && part.endsWith('$$')) {
        return katex.renderToString(part.slice(2, -2), { throwOnError: false, displayMode: true })
      }
      if (part.length > 2 && part.startsWith('$') && part.endsWith('$')) {
        return katex.renderToString(part.slice(1, -1), { throwOnError: false })
      }
      return escapeHtml(part)
    })
    .join('')
}
