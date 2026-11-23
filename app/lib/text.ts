// Small text helpers safe to use in the browser.

/**
 * Text as the student reads it: markdown emphasis and headings the model sometimes writes are removed (the page shows
 * plain text, so "**word**" would show its asterisks). Math between dollar signs is left alone.
 */
export function plainText(s: string) {
  return s
    .split(/(\$[^$]*\$)/)
    .map((part, i) =>
      i % 2
        ? part
        : part
            .replace(/\*\*(\S(?:[^*]*?\S)?)\*\*/g, '$1')
            .replace(/__(\S(?:[^_]*?\S)?)__/g, '$1')
            .replace(/^#{1,6}\s+/gm, ''),
    )
    .join('')
}
