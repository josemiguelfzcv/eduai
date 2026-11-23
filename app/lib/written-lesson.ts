// The written lesson of a lecture: its outline, and the text of each section as blocks the page draws. Pure and
// browser-safe: the parser runs on a section's stored text and on a section still being written (streamed), so an
// unfinished box or formula simply shows as far as it has gone.
//
// The model writes each section in a small Markdown dialect:
//
//   Plain paragraphs, **bold**, *italic*, inline math $...$ and display math on its own lines: $$ ... $$
//   - bulleted and 1. numbered lists
//   ### A subheading
//   :::definition What is a moment generating function?      boxes: definition, theorem, example, note,
//   ...                                                       takeaways, practice; ":::" alone closes the box
//   :::takeaways                                              a box inside an example becomes its side note
//   - ...
//   :::
//   :::

export type SectionKind = 'foundations' | 'concept' | 'derivation' | 'example' | 'practice' | 'summary'

export type OutlineSection = {
  id: string
  title: string
  goal: string
  kind: SectionKind
  skillIds: number[]
  pages: number[]
  minutes: number
}

export const BOX_KINDS = ['definition', 'theorem', 'example', 'note', 'takeaways', 'practice'] as const
export type BoxKind = (typeof BOX_KINDS)[number]

export type Block =
  | { type: 'paragraph'; id: string; text: string }
  | { type: 'heading'; id: string; text: string }
  | { type: 'list'; id: string; ordered: boolean; items: string[] }
  | { type: 'math'; id: string; tex: string }
  | {
      type: 'box'
      id: string
      kind: BoxKind
      title: string | null
      blocks: Block[]
      aside: Block | null
      open: boolean
    }

type Container = { blocks: Block[]; box: Extract<Block, { type: 'box' }> | null }

/** Parses a section's text into blocks. Ids are `${sectionId}-b${n}` in reading order, stable as text is appended. */
export function parseSection(sectionId: string, source: string): Block[] {
  const root: Container = { blocks: [], box: null }
  const stack: Container[] = [root]
  let n = 0
  const id = () => `${sectionId}-b${++n}`
  const top = () => stack[stack.length - 1]

  let paragraph: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let math: string[] | null = null

  const flushParagraph = () => {
    if (paragraph.length) top().blocks.push({ type: 'paragraph', id: id(), text: paragraph.join(' ').trim() })
    paragraph = []
  }
  const flushList = () => {
    if (list?.items.length) top().blocks.push({ type: 'list', id: id(), ordered: list.ordered, items: list.items })
    list = null
  }
  const flush = () => {
    flushParagraph()
    flushList()
  }

  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  for (const raw of lines) {
    const line = raw.trimEnd()
    const trimmed = line.trim()

    if (math) {
      // Inside display math: until a line ending in $$.
      if (trimmed.endsWith('$$')) {
        math.push(trimmed.slice(0, -2))
        top().blocks.push({ type: 'math', id: id(), tex: math.join('\n').trim() })
        math = null
      } else math.push(line)
      continue
    }

    const fence = /^:{3,}\s*([a-z]+)?\s*(.*)$/.exec(trimmed)
    if (fence) {
      flush()
      const kind = fence[1] as BoxKind | undefined
      if (kind && (BOX_KINDS as readonly string[]).includes(kind)) {
        const box: Extract<Block, { type: 'box' }> = {
          type: 'box',
          id: id(),
          kind,
          title: fence[2].trim() || null,
          blocks: [],
          aside: null,
          open: true,
        }
        const parent = top()
        // Takeaways inside an example sit beside it rather than inside its text.
        if (kind === 'takeaways' && parent.box?.kind === 'example' && !parent.box.aside) parent.box.aside = box
        else parent.blocks.push(box)
        stack.push({ blocks: box.blocks, box })
      } else if (!kind && stack.length > 1) {
        const closed = stack.pop()!
        if (closed.box) closed.box.open = false
      }
      continue
    }

    if (trimmed.startsWith('$$')) {
      flush()
      const rest = trimmed.slice(2)
      if (rest.endsWith('$$') && rest.length > 2)
        top().blocks.push({ type: 'math', id: id(), tex: rest.slice(0, -2).trim() })
      else math = [rest]
      continue
    }

    if (!trimmed) {
      flush()
      continue
    }

    const heading = /^#{2,4}\s+(.*)$/.exec(trimmed)
    if (heading) {
      flush()
      top().blocks.push({ type: 'heading', id: id(), text: heading[1].trim() })
      continue
    }

    const item = /^(?:([-*•])|(\d+)[.)])\s+(.*)$/.exec(trimmed)
    if (item) {
      flushParagraph()
      const ordered = !!item[2]
      if (list && list.ordered !== ordered) flushList()
      if (!list) list = { ordered, items: [] }
      list.items.push(item[3])
      continue
    }

    if (list && /^\s{2,}\S/.test(line)) {
      // An indented line continues the last list item.
      list.items[list.items.length - 1] += ` ${trimmed}`
      continue
    }
    flushList()
    paragraph.push(trimmed)
  }
  flush()
  // An unfinished formula (still streaming) shows what has arrived so far.
  if (math) top().blocks.push({ type: 'math', id: id(), tex: math.join('\n').trim() })
  return root.blocks
}

/** Every block id in reading order, nested boxes included. */
export function blockIds(blocks: Block[]): string[] {
  const out: string[] = []
  for (const b of blocks) {
    out.push(b.id)
    if (b.type === 'box') {
      out.push(...blockIds(b.blocks))
      if (b.aside) out.push(...blockIds([b.aside]))
    }
  }
  return out
}

/** The plain words of a block, for quoting it in a question. */
export function blockText(b: Block): string {
  switch (b.type) {
    case 'paragraph':
    case 'heading':
      return b.text
    case 'list':
      return b.items.join(' ')
    case 'math':
      return `$$${b.tex}$$`
    case 'box':
      return [b.title ?? '', ...b.blocks.map(blockText), b.aside ? blockText(b.aside) : ''].filter(Boolean).join(' ')
  }
}

/** Reading time of a written section, at 200 words a minute for prose and slower for math. */
export function readingMinutes(source: string) {
  const words = source
    .replace(/\$\$[\s\S]*?\$\$|\$[^$\n]*\$/g, ' formula formula formula ')
    .split(/\s+/)
    .filter(Boolean)
  return Math.max(1, Math.round(words.length / 200))
}

/** Checks an outline the model wrote: ids s1, s2, ... in order, titles present, at most 12 sections. */
export function cleanOutline(
  raw: { title?: unknown; goal?: unknown; kind?: unknown; skillIds?: unknown; pages?: unknown; minutes?: unknown }[],
  known: { skillIds: Set<number>; pages: Set<number> },
): OutlineSection[] {
  const kinds: SectionKind[] = ['foundations', 'concept', 'derivation', 'example', 'practice', 'summary']
  return raw
    .map((s) => ({
      title: String(s.title ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120),
      goal: String(s.goal ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 300),
      kind: (kinds.includes(s.kind as SectionKind) ? s.kind : 'concept') as SectionKind,
      skillIds: [...new Set(((s.skillIds as unknown[]) ?? []).map(Number).filter((id) => known.skillIds.has(id)))],
      pages: [...new Set(((s.pages as unknown[]) ?? []).map(Number).filter((p) => known.pages.has(p)))].sort(
        (x, y) => x - y,
      ),
      minutes: Math.min(30, Math.max(2, Math.round(Number(s.minutes) || 5))),
    }))
    .filter((s) => s.title)
    .slice(0, 12)
    .map((s, i) => ({ id: `s${i + 1}`, ...s }))
}

// ---------- reading position ----------

/** Where the student is reading: the block at the top of the view, and how far down it the view starts (0 to 1). */
export type ReadingAnchor = { section: string; block: string; offset: number }

/**
 * The anchor for a scroll position, from the blocks' tops and heights relative to the scroll container's content.
 * The first block whose bottom is below the view's top is the one being read.
 */
export function anchorAt(
  scrollTop: number,
  blocks: { id: string; section: string; top: number; height: number }[],
): ReadingAnchor | null {
  for (const b of blocks) {
    if (b.top + b.height > scrollTop + 1) {
      const offset = b.height > 0 ? Math.min(1, Math.max(0, (scrollTop - b.top) / b.height)) : 0
      return { section: b.section, block: b.id, offset: Math.round(offset * 1000) / 1000 }
    }
  }
  const last = blocks[blocks.length - 1]
  return last ? { section: last.section, block: last.id, offset: 1 } : null
}

/** The scroll position that puts an anchor back where it was, after the layout changed. */
export function scrollFor(anchor: ReadingAnchor, block: { top: number; height: number } | undefined) {
  if (!block) return null
  return Math.max(0, Math.round(block.top + anchor.offset * block.height))
}
