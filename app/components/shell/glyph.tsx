import { BookIcon, ChartIcon, LaptopIcon, LayersIcon, SigmaIcon, TempleIcon } from '../learn/icons'

// A course's emblem: a small tile with a sign for its subject, read from its code and name (Σ for mathematics, a
// laptop for computing, a chart for economics…). The same course wears the same emblem everywhere.

const ICONS = {
  math: SigmaIcon,
  language: LayersIcon,
  economics: ChartIcon,
  history: TempleIcon,
  computing: LaptopIcon,
  other: BookIcon,
}
type Subject = keyof typeof ICONS

const SUBJECTS: { subject: RegExp; is: Subject }[] = [
  { subject: /\b(prob\w*|stat\w*|math\w*|calc\w*|algebra|geometr\w*|number|analysis)/i, is: 'math' },
  { subject: /\b(nlp|language\w*|linguist\w*|literat\w*|writing|english|spanish|french|rhetoric)/i, is: 'language' },
  { subject: /\b(econ\w*|financ\w*|account\w*|business|market\w*|money|invest\w*|trading)/i, is: 'economics' },
  {
    subject: /\b(hist\w*|classic\w*|philosoph\w*|art|archae\w*|greek|roman|europe\w*|religio\w*|politic\w*)/i,
    is: 'history',
  },
  {
    subject:
      /\b(ai|artificial|machine|robot\w*|intelligen\w*|neural|comput\w*|program\w*|software|data|algorithm\w*|csci?|cs)\b/i,
    is: 'computing',
  },
]

export function courseSubject(course: { name: string; code: string | null }): Subject {
  const words = `${course.name} ${course.code ?? ''}`
  return SUBJECTS.find((s) => s.subject.test(words))?.is ?? 'other'
}

const TONES = {
  /** On paper. */
  sage: 'bg-[#e6ead6] text-[#1f4a2c]',
  /** Filled, on paper. */
  grove: 'bg-[#1f4a2c] text-[#f6f1e7]',
  /** On the sidebar's green. */
  mist: 'bg-ivory/[0.12] text-ivory ring-1 ring-ivory/[0.08]',
} as const

export function CourseGlyph({
  course,
  size = 42,
  tone = 'sage',
}: {
  course: { name: string; code: string | null }
  size?: number
  tone?: keyof typeof TONES
}) {
  const Icon = ICONS[courseSubject(course)]
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-[24%] ${TONES[tone]}`}
      style={{ width: size, height: size }}
    >
      <Icon size={Math.round(size * 0.56)} />
    </span>
  )
}
