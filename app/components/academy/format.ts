import { DEADLINE_KINDS, type DatedDeadline, type LessonProgress } from '../../lib/academy'

export const kindLabel = (kind: DatedDeadline['kind']) => DEADLINE_KINDS.find((k) => k.id === kind)?.label ?? 'Deadline'

/** Month and day for the little calendar block, read from the date itself (no time zone shifts). */
export function dateParts(isoDate: string) {
  const [y, m, d] = isoDate.split('-').map(Number)
  const month = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  return { month, day: d }
}

/** Label and tone for how soon something is due. */
export function dueLabel(d: DatedDeadline): { text: string; tone: string } {
  if (d.completedAt) return { text: 'Done', tone: 'text-moss border-moss/30' }
  if (d.daysLeft < 0) return { text: 'Past due', tone: 'text-terracotta border-terracotta/40' }
  if (d.daysLeft === 0) return { text: 'Today', tone: 'text-terracotta border-terracotta/40' }
  if (d.daysLeft === 1) return { text: 'Tomorrow', tone: 'text-terracotta border-terracotta/40' }
  if (d.daysLeft <= 3) return { text: `In ${d.daysLeft} days`, tone: 'text-terracotta border-terracotta/40' }
  if (d.daysLeft <= 7) return { text: `In ${d.daysLeft} days`, tone: 'text-gold-deep border-gold/60' }
  return { text: `In ${d.daysLeft} days`, tone: 'text-ink-soft border-line' }
}

export function lessonStatus(l: LessonProgress) {
  if (l.status === 'not-ready') return 'Not ready'
  if (l.status === 'new') return 'Not started'
  if (l.status === 'in-progress') return `In progress, part ${l.resumePart ?? l.parts} of ${l.parts} next`
  return `${l.firstTryCorrect} of ${l.partsChecked} right on the first try`
}

export function lessonHref(l: LessonProgress) {
  return l.status === 'in-progress' && l.resumePart ? `/class/${l.id}?part=${l.resumePart}` : `/class/${l.id}`
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
