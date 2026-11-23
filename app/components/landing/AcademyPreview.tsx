import type { CSSProperties } from 'react'
import {
  ArrowRightIcon,
  BellIcon,
  CalendarIcon,
  ChartIcon,
  HomeIcon,
  PlayIcon,
  SearchIcon,
  SparkleIcon,
} from '../learn/icons'
import { LaurelMark } from '../learn/LaurelMark'

// My Academy as the tablet in section 2 shows it: a 1200 × 770 screen, laid out on the design's own screen (measured
// from the design, flattened) and laid onto the tablet by the section. Drawn with the app's pieces: the one sidebar
// (the same three places and the courses), the student's courses, progress counted in ideas, and the next step.
// Sample courses; nothing here is a statistic about Lyceo.

export const ACADEMY_SCREEN = { width: 1200, height: 770 }

const THUMBS = '/images/lyceo/course_thumbnails'
const COURSES = [
  { code: 'CSCI 270', name: 'Foundations of AI', art: `${THUMBS}/02_responsible_ai_csci_382.webp`, read: 0.6 },
  { code: 'ECON 232', name: 'Financial Economics', art: `${THUMBS}/03_financial_economics_econ_232.webp`, read: 0.62 },
  { code: 'MATH 341', name: 'Probability', art: `${THUMBS}/01_probability_math_341.webp`, read: 0.6 },
  { code: 'HIST 245', name: 'Modern Europe', art: `${THUMBS}/05_history_hist_245.webp`, read: 0.62 },
]
const IDEAS = [
  { code: 'CSCI 270', confirmed: 6, total: 7 },
  { code: 'ECON 232', confirmed: 5, total: 7 },
  { code: 'MATH 341', confirmed: 4, total: 6 },
  { code: 'HIST 245', confirmed: 6, total: 7 },
]

const at = (left: number, top: number, width?: number, height?: number): CSSProperties => ({
  position: 'absolute',
  left,
  top,
  width,
  height,
})
const icon = (size: number): CSSProperties => ({ width: size, height: size })

export function AcademyScreen() {
  const confirmed = IDEAS.reduce((n, c) => n + c.confirmed, 0)
  const total = IDEAS.reduce((n, c) => n + c.total, 0)
  return (
    <div
      className="relative overflow-hidden rounded-[24px] bg-[#f2e8da] font-sans text-[#1f241c]"
      style={ACADEMY_SCREEN}
    >
      {/* The sidebar */}
      <div className="absolute inset-y-0 left-0 w-[249px] overflow-hidden bg-[#23351e] text-[#f1e9d8]">
        <span className="flex items-center gap-[11px]" style={at(37, 39)}>
          <LaurelMark size={0} className="text-[#efe5d1]" style={icon(40)} />
          <span className="font-display text-[35px] font-[650] leading-none [font-variation-settings:'opsz'_36]">
            Lyceo
          </span>
        </span>
        <span className="rounded-[16px] bg-[#4c5d3a]" style={at(17, 127, 216, 56)} />
        {[
          { label: 'My Academy', Icon: HomeIcon, y: 155 },
          { label: 'Study Plan', Icon: CalendarIcon, y: 221 },
          { label: 'Global Progress', Icon: ChartIcon, y: 287 },
        ].map(({ label, Icon, y }, i) => (
          <span
            key={label}
            className={`flex items-center gap-[14px] text-[18px] font-medium leading-none ${i ? 'text-[#f1e9d8]/85' : ''}`}
            style={at(45, y - 12, 190, 24)}
          >
            <Icon size={0} style={icon(24)} />
            {label}
          </span>
        ))}
        <span className="text-[14px] font-medium leading-none text-[#f1e9d8]/65" style={at(46, 336)}>
          Your Courses
        </span>
        {COURSES.map((c, i) => (
          <span key={c.code} className="flex items-center gap-[12px]" style={at(43, 362 + i * 44, 190, 34)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.art} alt="" className="size-[34px] shrink-0 rounded-[8px] object-cover ring-1 ring-white/15" />
            <span className="font-display text-[17px] font-semibold leading-none">{c.code}</span>
          </span>
        ))}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/lyceo/derived/temple-hill.webp"
          alt=""
          className="absolute inset-x-0 bottom-0 h-[215px] w-full object-cover [mask-image:linear-gradient(to_bottom,transparent,#000_38%)]"
        />
      </div>

      {/* The page */}
      <p
        className="m-0 font-display text-[47px] font-semibold leading-none tracking-[-0.005em] text-[#1d2a1a] [font-variation-settings:'opsz'_36]"
        style={at(295, 47)}
      >
        My Academy
      </p>
      <p className="m-0 text-[18px] leading-none text-[#5b554a]" style={at(295, 115)}>
        Your courses, progress, and next steps.
      </p>
      <SearchIcon size={0} strokeWidth={1.9} style={{ ...at(996, 49), ...icon(27) }} />
      <BellIcon size={0} strokeWidth={1.9} style={{ ...at(1060, 49), ...icon(27) }} />
      <span
        className="grid place-items-center rounded-full bg-[#2c4a2a] font-display text-[18px] font-semibold text-[#f6efe1] ring-2 ring-[#e6d6b8]"
        style={at(1117, 41, 45, 45)}
      >
        JM
      </span>

      {COURSES.map((c, i) => (
        <div
          key={c.code}
          className="overflow-hidden rounded-[14px] border border-[#e9ddcc] bg-[#f9f0e4] shadow-[0_10px_22px_-16px_rgba(70,45,15,0.55)]"
          style={at([281, 512, 740, 967][i], 174, 211, 217)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.art} alt="" className="h-[87px] w-full object-cover" />
          <p className="m-0 px-[21px] pt-[22px] text-[21px] font-semibold leading-none text-[#1d211a]">{c.code}</p>
          <p className="m-0 px-[21px] pt-[13px] text-[16px] leading-none text-[#4b463d]">{c.name}</p>
          <span className="mx-[21px] mt-[27px] block h-[8px] overflow-hidden rounded-full bg-[#ddd0bf]">
            <span className="block h-full rounded-full bg-[#596a44]" style={{ width: `${c.read * 100}%` }} />
          </span>
        </div>
      ))}

      <div
        className="rounded-[16px] border border-[#e9ddcc] bg-[#f9f0e4] shadow-[0_12px_26px_-18px_rgba(70,45,15,0.5)]"
        style={at(278, 430, 555, 256)}
      >
        <p
          className="m-0 font-display text-[25px] font-bold leading-none text-[#1d211a] [font-variation-settings:'opsz'_24]"
          style={at(22, 27)}
        >
          Your Progress
        </p>
        <Ring confirmed={confirmed} total={total} style={at(25, 92, 136, 136)} />
        <span className="w-px bg-[#3c2d14]/[0.12]" style={at(190, 90, 1, 140)} />
        {IDEAS.map((c, i) => (
          <span
            key={c.code}
            className="flex items-center text-[16px] leading-none text-[#2c2a24]"
            style={at(214, 92 + i * 38.7, 322, 22)}
          >
            <span className="w-[103px] shrink-0">{c.code}</span>
            <span className="h-[9px] w-[164px] shrink-0 overflow-hidden rounded-full bg-[#ded1c0]">
              <span
                className="block h-full rounded-full bg-[#56683f]"
                style={{ width: `${(c.confirmed / c.total) * 100}%` }}
              />
            </span>
            <span className="ml-auto text-right">
              {c.confirmed} of {c.total}
            </span>
          </span>
        ))}
      </div>

      <div
        className="rounded-[16px] border border-[#e9ddcc] bg-[#f9f0e4] shadow-[0_12px_26px_-18px_rgba(70,45,15,0.5)]"
        style={at(852, 430, 326, 256)}
      >
        <SparkleIcon size={0} className="text-[#c08a2a]" strokeWidth={2} style={{ ...at(21, 29), ...icon(25) }} />
        <p
          className="m-0 font-display text-[23px] font-bold leading-none text-[#1d211a] [font-variation-settings:'opsz'_24]"
          style={at(59, 32)}
        >
          What to Study Next
        </p>
        <ArrowRightIcon size={0} strokeWidth={1.9} style={{ ...at(284, 33), ...icon(20) }} />
        <div className="rounded-[14px] bg-[#efe2d0]" style={at(20, 104, 286, 86)}>
          <span
            className="grid place-items-center rounded-full border-[1.6px] border-[#b98a3a] text-[#7b5a20]"
            style={at(19, 20, 44, 44)}
          >
            <PlayIcon size={0} style={{ ...icon(17), marginLeft: 2 }} />
          </span>
          <p className="m-0 text-[18px] font-semibold leading-none text-[#1d211a]" style={at(82, 23)}>
            Random Variables
          </p>
          <p className="m-0 text-[15px] leading-none text-[#5b554a]" style={at(82, 51)}>
            MATH 341 · About 20 min
          </p>
        </div>
      </div>
    </div>
  )
}

/** Confirmed ideas out of all the ideas in the student's courses: a count, drawn as a ring. */
function Ring({ confirmed, total, style }: { confirmed: number; total: number; style: CSSProperties }) {
  const r = 62
  const c = 2 * Math.PI * r
  return (
    <span className="block" style={style}>
      <svg viewBox="0 0 136 136" className="size-full -rotate-90">
        <circle cx="68" cy="68" r={r} fill="none" stroke="#e1d5c4" strokeWidth="11" />
        <circle
          cx="68"
          cy="68"
          r={r}
          fill="none"
          stroke="#2b4a29"
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={`${(confirmed / total) * c} ${c}`}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="font-display text-[27px] font-semibold text-[#1d211a] [font-variation-settings:'opsz'_24]">
          {confirmed}/{total}
        </span>
        <span className="mt-[6px] text-[11px] text-[#5b554a]">ideas confirmed</span>
      </span>
    </span>
  )
}
