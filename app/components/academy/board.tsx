'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import type { AcademyCourse, StudyAction } from '../../lib/academy'
import { BANNERS } from '../../lib/art'
import { shortDay } from '../../lib/mastery'
import { postJSON } from '../../lib/supabase'
import { ArrowRightIcon, PencilIcon, PlayIcon, RepeatIcon, UploadIcon } from '../learn/icons'
import { LaurelMark } from '../learn/LaurelMark'
import { HEADER } from '../shell/Shell'
import { startQuickCheck } from '../study/client'
import { dateParts } from './format'

// The pieces My Academy, Study Plan and Global Progress are built from, as designed: the page with its title and
// scene, the strip of four figures, paper cards and the green feature card, and the small marks inside them (bars,
// rings, tags, date tiles, the two charts). Every figure they show comes from the student's own records.

const PAPER = '#fdf8f0'
const GREEN = '#1f5a34'
const TRACK = '#e6dccb'

/** A module's page: its title and description over the academy's scene, then its cards. */
export function ModulePage({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  const fade =
    'linear-gradient(to right, transparent 3%, #000 48%), linear-gradient(to bottom, #000 56%, transparent 98%)'
  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-0 w-[56%] max-w-[900px] select-none overflow-hidden opacity-[0.8]"
        style={{
          top: -HEADER,
          height: 276,
          maskImage: fade,
          WebkitMaskImage: fade,
          maskComposite: 'intersect',
          WebkitMaskComposite: 'source-in',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={BANNERS[2].src}
          alt=""
          className="h-full w-full object-cover"
          style={{ objectPosition: BANNERS[2].position }}
        />
      </div>
      <div className="relative mx-auto w-full max-w-[1340px] px-8 pb-12">
        <header>
          <h1 className="font-display text-[clamp(2.5rem,3.25vw,3rem)] font-semibold leading-[1.1] tracking-[-0.012em] text-[#1c3a26]">
            {title}
          </h1>
          <p className="mt-2 max-w-[36rem] text-[1.1rem] leading-[1.4] text-[#3a3f38]">{description}</p>
        </header>
        <div className="mt-[22px] space-y-[22px]">{children}</div>
      </div>
    </div>
  )
}

export function StatStrip({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[0.94fr_1.02fr_1.08fr_0.96fr] divide-x divide-[#eadfcd] rounded-[18px] border border-[#eee3d2] bg-[#fdf8f0]/95 shadow-[0_4px_18px_-10px_rgba(95,65,25,0.25)] backdrop-blur-[2px]">
      {children}
    </div>
  )
}

/** One figure of the strip. `title` says exactly what was counted. */
export function Stat({
  icon,
  value,
  label,
  title,
}: {
  icon: React.ReactNode
  value: React.ReactNode
  label: string
  title?: string
}) {
  return (
    <div className="flex min-w-0 items-center gap-[14px] py-[13px] pl-6 pr-2" title={title}>
      <span className="shrink-0 text-[#1f4a2c]" aria-hidden="true">
        {icon}
      </span>
      <p className="m-0 min-w-0">
        <span className="block truncate font-display text-[1.19rem] font-semibold leading-[1.2] tracking-[-0.012em] text-[#1d1c19]">
          {value}
        </span>
        <span className="block truncate text-[0.93rem] leading-[1.3] text-[#4b4a43]">{label}</span>
      </p>
    </div>
  )
}

type CardProps = {
  icon?: React.ReactNode
  title: string
  subtitle?: React.ReactNode
  /** Top right of the card: a link or a control. */
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function Card({ icon, title, subtitle, action, children, className = '' }: CardProps) {
  const id = useId()
  return (
    <section
      aria-labelledby={id}
      className={`flex min-w-0 flex-col rounded-[18px] border border-[#eee3d2] bg-[#fdf8f0] px-6 pb-[18px] pt-[19px] shadow-[0_4px_18px_-10px_rgba(95,65,25,0.22)] ${className}`}
    >
      <header className="flex items-start gap-4">
        {icon && (
          <span className="mt-[3px] shrink-0 text-[#1f4a2c]" aria-hidden="true">
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 id={id} className="font-display text-[1.42rem] font-semibold leading-[1.15] text-[#1d1c19]">
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-[0.94rem] leading-[1.3] text-[#4b4a43]">{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className="mt-3 min-h-0 flex-1">{children}</div>
    </section>
  )
}

/** The green card that leads a page; its content sits on a sheet of paper inside. */
export function FeatureCard({ icon, title, subtitle, action, children, className = '' }: CardProps) {
  const id = useId()
  return (
    <section
      aria-labelledby={id}
      className={`relative flex min-w-0 flex-col overflow-hidden rounded-[18px] bg-[linear-gradient(165deg,#215231,#16401f_60%,#123619)] p-5 pt-[19px] text-ivory shadow-[0_12px_28px_-16px_rgba(20,45,20,0.75)] ${className}`}
    >
      <LaurelMark
        size={200}
        className="pointer-events-none absolute -right-7 -top-14 rotate-[16deg] text-ivory opacity-[0.08]"
      />
      <header className="relative flex items-start gap-4 px-0.5">
        {icon && (
          <span className="mt-[3px] shrink-0 text-ivory" aria-hidden="true">
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 id={id} className="font-display text-[1.42rem] font-semibold leading-[1.15] text-ivory">
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-[0.94rem] leading-[1.3] text-ivory/85">{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className="relative mt-4 min-h-0 flex-1 rounded-[14px] bg-[#fdf8f0] text-ink shadow-[0_8px_18px_-12px_rgba(0,0,0,0.55)]">
        {children}
      </div>
    </section>
  )
}

export function MoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="mt-1 inline-flex shrink-0 items-center gap-1.5 text-[0.9rem] font-medium text-[#6b4a12] no-underline hover:underline hover:underline-offset-4"
    >
      {children} <ArrowRightIcon size={16} />
    </Link>
  )
}

/** A share of a whole, as a bar. */
export function Bar({ value, className = '' }: { value: number; className?: string }) {
  const share = Math.min(Math.max(value, 0), 1)
  return (
    <span className={`block h-[7px] overflow-hidden rounded-full ${className}`} style={{ background: TRACK }}>
      <span className="block h-full rounded-full" style={{ width: `${share * 100}%`, background: GREEN }} />
    </span>
  )
}

/** A share of a whole, as a ring. */
export function Ring({ value, size = 44, stroke = 6 }: { value: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const share = Math.min(Math.max(value, 0), 1)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={TRACK} strokeWidth={stroke} />
      {share > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={GREEN}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${share * c} ${c}`}
        />
      )}
    </svg>
  )
}

const TAG = {
  gold: 'bg-[#f6e8c6] text-[#6b4a12]',
  amber: 'bg-[#f1d792] text-[#5b3f0a]',
  sage: 'bg-[#e4ead2] text-[#1f4a2c]',
  clay: 'bg-[#f3ddd0] text-[#8a3d1c]',
  stone: 'bg-[#ece4d5] text-[#4b4a43]',
} as const
export type TagTone = keyof typeof TAG

export function Tag({ tone = 'gold', children }: { tone?: TagTone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-[8px] px-[11px] py-[4px] text-[0.82rem] font-medium leading-[1.35] ${TAG[tone]}`}
    >
      {children}
    </span>
  )
}

/** The month and day of a date, as a little calendar leaf. */
export function DateTile({ iso }: { iso: string }) {
  const { month, day } = dateParts(iso)
  return (
    <span className="grid w-[52px] shrink-0 place-items-center rounded-[9px] bg-[#f3eadc] pb-[4px] pt-[3px] text-[#1d1c19]">
      <span className="text-[0.62rem] font-medium uppercase leading-[1.3] tracking-[0.08em] text-[#4b4a43]">
        {month}
      </span>
      <span className="font-display text-[1.16rem] font-medium leading-none">{day}</span>
    </span>
  )
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="m-0 py-2 text-[0.95rem] leading-relaxed text-[#4b4a43]">{children}</p>
}

/** Lines standing in for a card's content while it loads. */
export function Waiting({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-3 py-1" aria-busy="true" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <span
          key={i}
          className="block h-4 animate-pulse rounded-md bg-[#ece3d3] motion-reduce:animate-none"
          style={{ width: `${[88, 72, 80, 64][i % 4]}%` }}
        />
      ))}
    </div>
  )
}

// ---- figures in words ----

export const minutesLabel = (minutes: number) =>
  minutes < 60 ? `${minutes} min` : `${(minutes / 60).toFixed(1).replace(/\.0$/, '')} hrs`

export const percent = (share: number) => `${Math.round(share * 100)}%`

/** 'Today', 'Yesterday' or 'Nov 20' for a day (YYYY-MM-DD) seen from today. */
export function dayLabel(day: string, today: string) {
  if (day === today) return 'Today'
  const before = new Date(`${today}T12:00:00Z`)
  before.setUTCDate(before.getUTCDate() - 1)
  return day === before.toISOString().slice(0, 10) ? 'Yesterday' : shortDay(day)
}

export const courseTitle = (course: Pick<AcademyCourse, 'name' | 'code'>) => course.code || course.name

// ---- courses in color ----

// A course keeps one color wherever it is drawn among others (the week, the workload). Five hues, checked together
// with the palette validator on the paper surface; a sixth course and beyond stay neutral rather than reuse one.
const COURSE_HUES = ['#2f7d3a', '#b8862b', '#7d5a9a', '#c05a30', '#2b7fa8']
const NEUTRAL_HUE = '#8a8376'

export function courseHues(courses: Pick<AcademyCourse, 'id'>[]) {
  const order = [...courses].sort((a, b) => a.id - b.id).map((c) => c.id)
  return (id: number | null) => (id === null ? NEUTRAL_HUE : (COURSE_HUES[order.indexOf(id)] ?? NEUTRAL_HUE))
}

// ---- the plan's steps ----

const KIND_ICON: Record<StudyAction['kind'], React.ComponentType<{ size?: number }>> = {
  review: RepeatIcon,
  'open-review': RepeatIcon,
  'review-skills': RepeatIcon,
  continue: PlayIcon,
  start: PlayIcon,
  resume: PlayIcon,
  confirm: PencilIcon,
  practice: PencilIcon,
  'first-check': PencilIcon,
  'add-material': UploadIcon,
}
export const KIND_VERB: Record<StudyAction['kind'], string> = {
  review: 'Start review',
  'open-review': 'Open review',
  'review-skills': 'Start',
  continue: 'Continue',
  start: 'Start',
  resume: 'Resume',
  confirm: 'Start',
  practice: 'Start',
  'first-check': 'Start',
  'add-material': 'Add material',
}

export function StepIcon({ kind, size = 19 }: { kind: StudyAction['kind']; size?: number }) {
  const Icon = KIND_ICON[kind]
  return <Icon size={size} />
}

/** Starts a step of the plan: opens where it points, or writes its Quick Check or review first. */
export function useStepStarter() {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const start = async (action: StudyAction) => {
    if (action.href) return router.push(action.href)
    setBusy(action.key)
    setError(null)
    try {
      if (action.session) {
        router.push(`/sessions/${await startQuickCheck(action.session)}`)
        return
      }
      const { courseId } = await postJSON<{ courseId: number }>('/api/review', { courseId: action.lessonId })
      router.push(`/class/${courseId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start that step.')
      setBusy(null)
    }
  }
  /** Starts a Quick Check on chosen ideas of a course. */
  const check = async (key: string, courseId: number, skillIds: number[]) => {
    setBusy(key)
    setError(null)
    try {
      router.push(`/sessions/${await startQuickCheck({ courseId, skillIds, mode: 'quick_check' })}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not write the Quick Check.')
      setBusy(null)
    }
  }
  return { busy, error, start, check }
}
export type StepStarter = ReturnType<typeof useStepStarter>

/** A step of the plan as one thing to press: a link where the step has an address, a button where it must be made. */
export function StepTrigger({
  action,
  starter,
  className,
  children,
}: {
  action: StudyAction
  starter: StepStarter
  className?: string
  children: React.ReactNode
}) {
  return action.href ? (
    <Link href={action.href} className={className}>
      {children}
    </Link>
  ) : (
    <button
      type="button"
      onClick={() => starter.start(action)}
      disabled={starter.busy !== null}
      aria-busy={starter.busy === action.key}
      className={className}
    >
      {children}
    </button>
  )
}

// ---- charts ----

export type Segment = { key: string; label: string; value: number; color: string }

/** One whole split into its parts, as a ring with the total in the middle. Its legend carries the figures. */
export function Donut({ segments, total, unit }: { segments: Segment[]; total: number; unit: string }) {
  const size = 148
  const stroke = 24
  const r = (size - stroke) / 2
  const shown = segments.filter((s) => s.value > 0)
  // Two pixels of paper between neighbours.
  const gap = shown.length > 1 ? 2 / r : 0
  const arcs = shown.reduce<{ segment: Segment; from: number; to: number }[]>((list, segment) => {
    const from = list.length ? list[list.length - 1].to : -Math.PI / 2
    return [...list, { segment, from, to: from + (segment.value / total) * 2 * Math.PI }]
  }, [])
  const point = (angle: number) => `${size / 2 + r * Math.cos(angle)} ${size / 2 + r * Math.sin(angle)}`
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${total} ${unit}`}>
        {total === 0 || shown.length === 0 ? (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={TRACK} strokeWidth={stroke} />
        ) : shown.length === 1 ? (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={shown[0].color} strokeWidth={stroke}>
            <title>{`${shown[0].label}: ${shown[0].value} of ${total}`}</title>
          </circle>
        ) : (
          arcs.map(({ segment, from, to }) => (
            <path
              key={segment.key}
              d={`M ${point(from + gap / 2)} A ${r} ${r} 0 ${to - from > Math.PI ? 1 : 0} 1 ${point(to - gap / 2)}`}
              fill="none"
              stroke={segment.color}
              strokeWidth={stroke}
            >
              <title>{`${segment.label}: ${segment.value} of ${total} (${percent(segment.value / total)})`}</title>
            </path>
          ))
        )}
      </svg>
      <p className="absolute inset-0 m-0 flex flex-col items-center justify-center leading-none">
        <span className="font-display text-[1.75rem] font-semibold text-[#1d1c19]">{total}</span>
        <span className="mt-1.5 text-[0.9rem] text-[#4b4a43]">{unit}</span>
      </p>
    </div>
  )
}

/** A figure week by week, as a line over a light area. The last point is named; the others answer to hover or focus. */
export function TrendChart({
  points,
  max,
  unit,
}: {
  points: { label: string; value: number }[]
  /** The top of the scale (the whole there is to reach). */
  max: number
  /** What a value counts, for the labels: 'ideas confirmed'. */
  unit: string
}) {
  const [active, setActive] = useState<number | null>(null)
  const W = 520
  const H = 262
  const left = 40
  const right = 22
  const top = 26
  const bottom = 34
  const top0 = Math.max(max, 1)
  const step = top0 <= 5 ? 1 : Math.ceil(top0 / 4)
  const ticks = Array.from({ length: Math.floor(top0 / step) + 1 }, (_, i) => i * step)
  const scaleMax = Math.max(ticks[ticks.length - 1], top0)
  const x = (i: number) => left + (points.length > 1 ? (i / (points.length - 1)) * (W - left - right) : 0)
  const y = (value: number) => top + (1 - value / scaleMax) * (H - top - bottom)
  const line = points.map((p, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(p.value)}`).join(' ')
  const last = points.length - 1
  const shown = active ?? last
  const band = points.length > 1 ? (W - left - right) / (points.length - 1) : W
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`${unit}, week by week`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W - right} y1={y(t)} y2={y(t)} stroke="#ebe1d0" strokeWidth="1" />
            <text x={left - 10} y={y(t) + 4} textAnchor="end" fontSize="12.5" fill="#5b5a52">
              {t}
            </text>
          </g>
        ))}
        {points.map((p, i) => (
          <text key={p.label} x={x(i)} y={H - 10} textAnchor="middle" fontSize="12.5" fill="#5b5a52">
            {p.label}
          </text>
        ))}
        {points.length > 1 && (
          <>
            <path d={`${line} L ${x(last)} ${y(0)} L ${x(0)} ${y(0)} Z`} fill={GREEN} opacity="0.1" />
            <path d={line} fill="none" stroke={GREEN} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          </>
        )}
        {active !== null && active !== last && (
          <line x1={x(active)} x2={x(active)} y1={top} y2={y(0)} stroke="#cbbfa9" strokeWidth="1" />
        )}
        {points.map((p, i) => (
          <circle
            key={p.label}
            cx={x(i)}
            cy={y(p.value)}
            r={i === shown ? 5.5 : 4.5}
            fill={i === shown ? GREEN : PAPER}
            stroke={i === shown ? PAPER : GREEN}
            strokeWidth="2"
          />
        ))}
        {/* The named point: its value, above it. */}
        {points.length > 0 && (
          <g
            transform={`translate(${Math.min(Math.max(x(shown), left + 58), W - right - 58)} ${Math.max(y(points[shown].value) - 16, 14)})`}
          >
            <rect x={-58} y={-22} width={116} height={24} rx={8} fill="#f6e8c6" />
            <text textAnchor="middle" y={-5.5} fontSize="12.5" fontWeight="600" fill="#5b3f0a">
              {points[shown].value} {points[shown].value === 1 ? unit.replace(/^ideas/, 'idea') : unit}
            </text>
          </g>
        )}
        {/* Hover and focus: a wide column for each week. */}
        {points.map((p, i) => (
          <rect
            key={p.label}
            x={x(i) - band / 2}
            y={0}
            width={band}
            height={H}
            fill="transparent"
            tabIndex={0}
            role="img"
            aria-label={`${p.label}: ${p.value} ${unit}`}
            className="outline-none"
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
          />
        ))}
      </svg>
      <table className="sr-only">
        <caption>{unit}, week by week</caption>
        <tbody>
          {points.map((p) => (
            <tr key={p.label}>
              <th scope="row">{p.label}</th>
              <td>{p.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
