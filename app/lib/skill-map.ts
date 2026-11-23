// Checking a proposed skill map against the material it came from. Pure, so it's tested without a model.
//
// A quote counts as extracted only if its words are really on a page of the student's file. Anything the model says
// that can't be found there is marked inferred, which the student confirms or removes with one tap.

import type { Facet } from './mastery'

export type PageText = { n: number; text: string }

export type ProposedIdea = {
  name: string
  objective: string
  facets: string[]
  pages: number[]
  quote: string
  sameAsExistingId: number | null
}

export type VerifiedIdea = {
  name: string
  objective: string | null
  facets: Facet[]
  pages: number[]
  quote: string | null
  origin: 'extracted' | 'inferred'
  /** An existing skill of the course this idea is the same as. */
  existingSkillId: number | null
  /** True when Lyceo joined the idea with an existing skill of a different name: the student confirms it. */
  joined: boolean
}

const FACETS: Facet[] = ['conceptual', 'procedural', 'application']
export const MAX_IDEAS = 10

/** Text as it compares for quotes: one kind of quote mark, dash and space, no hyphenation at line ends, lowercase. */
export function normalizeText(s: string) {
  return s
    .normalize('NFKC')
    .replace(/[‘’ʼ′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/(\w)-\s*\n\s*(\w)/g, '$1$2')
    .replace(/[•·▪●◦■□►▸]/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim()
}

const squeeze = (s: string) => s.replace(/\s+/g, '')

/**
 * The pages a quote appears on. A quote may skip words with an ellipsis; its pieces must then appear in order on one
 * page. PDF text sometimes loses the spaces between words, so a page also matches with all spaces removed.
 */
export function findQuote(quote: string, pages: PageText[]): number[] {
  const q = normalizeText(quote)
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .replace(/[.,;:]$/, '')
  const pieces = q
    .split(/\s*(?:\.\.\.|…)\s*/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
  if (pieces.join(' ').length < 12 || pieces.some((p) => p.length < 4)) return []
  const inOrder = (text: string, parts: string[]) => {
    let from = 0
    for (const part of parts) {
      const at = text.indexOf(part, from)
      if (at < 0) return false
      from = at + part.length
    }
    return true
  }
  return pages
    .filter((p) => {
      const text = normalizeText(p.text)
      return inOrder(text, pieces) || inOrder(squeeze(text), pieces.map(squeeze))
    })
    .map((p) => p.n)
}

const cleanName = (s: string) =>
  s
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.:;]+$/, '')
    .slice(0, 120)
export const sameName = (a: string, b: string) => normalizeText(a) === normalizeText(b)

/**
 * Keeps the ideas that hold up: a name, valid pages, facets Lyceo knows, a quote found on the material (or the idea
 * is marked inferred), and an existing skill only if it is one of this course's. Duplicates are merged.
 */
export function verifyIdeas(
  proposed: ProposedIdea[],
  pages: PageText[],
  existing: { id: number; name: string }[],
  max = MAX_IDEAS,
): VerifiedIdea[] {
  const pageNumbers = new Set(pages.map((p) => p.n))
  const existingIds = new Map(existing.map((e) => [e.id, e]))
  const out: VerifiedIdea[] = []

  for (const p of proposed) {
    const name = cleanName(String(p.name ?? ''))
    if (!name) continue
    const objective =
      String(p.objective ?? '')
        .trim()
        .slice(0, 300) || null
    const facets = FACETS.filter((f) => (p.facets ?? []).includes(f))
    const cited = [...new Set((p.pages ?? []).map(Number).filter((n) => Number.isInteger(n) && pageNumbers.has(n)))]
    const quote = String(p.quote ?? '').trim()
    const found = quote ? findQuote(quote, pages) : []
    const onCited = found.filter((n) => cited.includes(n))
    const extracted = found.length > 0
    const where = extracted ? (onCited.length ? onCited : found) : cited

    let existingSkillId: number | null = null
    const claimed = p.sameAsExistingId === null || p.sameAsExistingId === undefined ? null : Number(p.sameAsExistingId)
    if (claimed !== null && existingIds.has(claimed)) existingSkillId = claimed
    const byName = existing.find((e) => sameName(e.name, name))
    if (byName) existingSkillId = byName.id

    const idea: VerifiedIdea = {
      name,
      objective,
      facets: facets.length ? facets : ['conceptual'],
      pages: [...new Set(where)].sort((a, b) => a - b).slice(0, 6),
      quote: extracted ? quote.replace(/\s+/g, ' ').slice(0, 300) : null,
      origin: extracted ? 'extracted' : 'inferred',
      existingSkillId,
      joined: existingSkillId !== null && !sameName(existingIds.get(existingSkillId)!.name, name),
    }

    const twin = out.find((o) =>
      idea.existingSkillId !== null
        ? o.existingSkillId === idea.existingSkillId
        : o.existingSkillId === null && sameName(o.name, idea.name),
    )
    if (twin) {
      twin.pages = [...new Set([...twin.pages, ...idea.pages])].sort((a, b) => a - b).slice(0, 6)
      if (twin.origin === 'inferred' && idea.origin === 'extracted') {
        twin.origin = 'extracted'
        twin.quote = idea.quote
      }
      continue
    }
    out.push(idea)
    if (out.length >= max) break
  }
  return out
}

/** "I found 6 ideas in this lecture: 4 were already in your course and 2 are new." Empty parts are left out. */
export function mapHeadline(total: number, already: number) {
  const ideas = `${total} ${total === 1 ? 'idea' : 'ideas'}`
  if (already === 0) return `I found ${ideas} in this material.`
  if (already === total)
    return total === 1
      ? 'I found 1 idea in this material. It was already in your course.'
      : `I found ${ideas} in this material, all already in your course.`
  const fresh = total - already
  return `I found ${ideas} in this material: ${already} ${already === 1 ? 'was' : 'were'} already in your course and ${fresh} ${fresh === 1 ? 'is' : 'are'} new.`
}

/** Splits text read from a PDF into one string with page offsets, as public.materials stores it. */
export function joinPages(pageTexts: string[]) {
  let text = ''
  const pages: { n: number; start: number }[] = []
  pageTexts.forEach((t, i) => {
    if (i > 0) text += '\n\n'
    pages.push({ n: i + 1, start: text.length })
    text += t.replace(/\u0000/g, '').trim()
  })
  return { text, pages }
}

/** The pages of a stored material, back from its text and offsets. */
export function splitPages(text: string, pages: { n: number; start: number }[]): PageText[] {
  return pages.map((p, i) => ({
    n: p.n,
    text: text.slice(p.start, i + 1 < pages.length ? pages[i + 1].start : undefined).trim(),
  }))
}

/**
 * Where an explanation comes from, for showing under it: the page it cites, with its quote only if the quote's words
 * are really on one of the excerpts' pages. Undefined when it cites nothing Lyceo showed it.
 */
export function citation(
  excerpts: { materialId: number; page: number; text: string }[],
  page: number | null,
  quote: string,
) {
  const pages = excerpts.map((e) => ({ n: e.page, text: e.text, materialId: e.materialId }))
  const found = quote ? findQuote(quote, pages) : []
  const onPage = page !== null && found.includes(page) ? page : found[0]
  const verified = onPage === undefined ? undefined : pages.find((p) => p.n === onPage)
  const cited = verified ?? pages.find((p) => p.n === page)
  if (!cited) return undefined
  return [
    {
      materialId: cited.materialId,
      pages: [cited.n],
      quote: verified ? quote.replace(/\s+/g, ' ').trim().slice(0, 300) : undefined,
    },
  ]
}
