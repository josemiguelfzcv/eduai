import { CalendarIcon, ChartIcon, HomeIcon, PlayIcon, SparkleIcon } from '../learn/icons'
import { LaurelMark } from '../learn/LaurelMark'

// A picture of My Academy drawn with the app's own pieces: the sidebar, course cards, progress by idea state and the
// next step. Sample courses; every element is something My Academy shows. Sized in em, so it scales with the page.

const BASE = '/images/lyceo/course_thumbnails'
const COURSES = [
  { code: 'MATH 341', name: 'Probability', art: `${BASE}/01_probability_math_341.webp`, read: 0.5 },
  { code: 'CSCI 382', name: 'Responsible AI', art: `${BASE}/02_responsible_ai_csci_382.webp`, read: 0.62 },
  { code: 'ECON 232', name: 'Financial Economics', art: `${BASE}/03_financial_economics_econ_232.webp`, read: 0.4 },
  { code: 'HIST 245', name: 'Modern Europe', art: `${BASE}/05_history_hist_245.webp`, read: 0.75 },
]
const PROGRESS = [
  { code: 'MATH 341', confirmed: 4, learning: 3, practice: 1, fresh: 2 },
  { code: 'CSCI 382', confirmed: 5, learning: 2, practice: 1, fresh: 1 },
  { code: 'ECON 232', confirmed: 3, learning: 3, practice: 2, fresh: 2 },
  { code: 'HIST 245', confirmed: 6, learning: 2, practice: 0, fresh: 1 },
]

export function AcademyPreview() {
  return (
    <div className="text-[clamp(6px,0.46vw,8.4px)] [perspective:220em]" aria-hidden="true">
      <div className="w-fit origin-left rounded-[3em] border border-[#e6ddcd] bg-gradient-to-br from-[#f7f3ec] to-[#e9e1d3] p-[1.1em] shadow-[0_5em_9em_-3em_rgba(60,40,15,0.55)] [transform:rotateY(-11deg)_rotateX(2.5deg)]">
        <div className="grid h-[40.5em] w-[76em] grid-cols-[14em_1fr] overflow-hidden rounded-[2em] bg-[#f8f2e8]">
          <div className="flex flex-col bg-[#173a20] px-[1.4em] py-[1.6em] text-[#f6f1e7]">
            <span className="flex items-center gap-[0.5em]">
              <LaurelMark size={22} className="text-[#f6f1e7]" />
              <span className="font-display text-[1.7em] font-semibold">Lyceo</span>
            </span>
            <ul className="mt-[1.8em] space-y-[0.35em] text-[1.05em]">
              <li className="flex items-center gap-[0.6em] rounded-[0.6em] bg-white/15 px-[0.7em] py-[0.45em]">
                <HomeIcon size={14} /> My Academy
              </li>
              <li className="flex items-center gap-[0.6em] px-[0.7em] py-[0.45em] opacity-85">
                <CalendarIcon size={14} /> Study Plan
              </li>
              <li className="flex items-center gap-[0.6em] px-[0.7em] py-[0.45em] opacity-85">
                <ChartIcon size={14} /> Global Progress
              </li>
            </ul>
            <p className="mt-[1.6em] text-[0.85em] opacity-70">Your Courses</p>
            <ul className="mt-[0.6em] space-y-[0.7em]">
              {COURSES.slice(0, 3).map((c) => (
                <li key={c.code} className="flex items-center gap-[0.6em]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.art} alt="" className="size-[2.6em] rounded-[0.5em] object-cover" />
                  <span className="leading-tight">
                    <span className="block font-display text-[1em] font-semibold">{c.code}</span>
                    <span className="block text-[0.8em] opacity-75">{c.name}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="px-[2em] py-[1.8em]">
            <p className="font-display text-[2.3em] font-bold leading-none tracking-[-0.01em] text-[#1d1c19]">
              My Academy
            </p>
            <p className="mt-[0.5em] text-[1em] text-[#5a594f]">Your courses, progress, and next steps.</p>
            <div className="mt-[1.4em] grid grid-cols-4 gap-[1em]">
              {COURSES.map((c) => (
                <div
                  key={c.code}
                  className="overflow-hidden rounded-[1em] border border-[#ece2d2] bg-[#fffbf4] shadow-[0_0.4em_1em_-0.6em_rgba(60,40,15,0.4)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.art} alt="" className="h-[6.4em] w-full object-cover" />
                  <div className="px-[0.8em] pb-[0.9em] pt-[0.6em]">
                    <p className="font-display text-[1.15em] font-semibold leading-tight text-[#1d1c19]">{c.code}</p>
                    <p className="truncate text-[0.82em] text-[#5a594f]">{c.name}</p>
                    <div className="mt-[0.7em] h-[0.4em] overflow-hidden rounded-full bg-[#ece4d5]">
                      <div className="h-full rounded-full bg-[#3d5a37]" style={{ width: `${c.read * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-[1.3em] grid grid-cols-[1.45fr_1fr] gap-[1em]">
              <div className="rounded-[1em] border border-[#ece2d2] bg-[#fffbf4] px-[1.2em] py-[1.1em]">
                <p className="font-display text-[1.3em] font-semibold text-[#1d1c19]">Your Progress</p>
                <div className="mt-[0.6em] flex gap-[1.2em] text-[0.8em] text-[#5a594f]">
                  <Legend color="#3d5a37" label="Confirmed" />
                  <Legend color="#e0c17a" label="Learning" />
                  <Legend color="#c26a44" label="Needs practice" />
                </div>
                <ul className="mt-[0.9em] space-y-[0.65em]">
                  {PROGRESS.map((p) => {
                    const total = p.confirmed + p.learning + p.practice + p.fresh
                    return (
                      <li
                        key={p.code}
                        className="grid grid-cols-[5.2em_1fr_4.6em] items-center gap-[0.8em] text-[0.86em]"
                      >
                        <span className="text-[#2a2924]">{p.code}</span>
                        <span className="flex h-[0.55em] overflow-hidden rounded-full bg-[#ece4d5]">
                          <span className="bg-[#3d5a37]" style={{ width: `${(p.confirmed / total) * 100}%` }} />
                          <span className="bg-[#e0c17a]" style={{ width: `${(p.learning / total) * 100}%` }} />
                          <span className="bg-[#c26a44]" style={{ width: `${(p.practice / total) * 100}%` }} />
                        </span>
                        <span className="text-right text-[#5a594f]">
                          {p.confirmed} of {total}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
              <div className="rounded-[1em] border border-[#ece2d2] bg-[#fffbf4] px-[1.2em] py-[1.1em]">
                <p className="flex items-center gap-[0.5em] font-display text-[1.3em] font-semibold text-[#1d1c19]">
                  <span className="text-[#b9893a]">
                    <SparkleIcon size={15} />
                  </span>
                  What to Study Next
                </p>
                <div className="mt-[1em] flex items-center gap-[0.9em] rounded-[0.9em] bg-[#f3ead9] px-[1em] py-[0.9em]">
                  <span className="grid size-[2.4em] place-items-center rounded-full border border-[#1d1c19]/60 text-[#1d1c19]">
                    <PlayIcon size={12} />
                  </span>
                  <span className="leading-tight">
                    <span className="block text-[1em] font-semibold text-[#1d1c19]">Random Variables</span>
                    <span className="block text-[0.82em] text-[#5a594f]">MATH 341, about 20 min</span>
                  </span>
                </div>
                <p className="mt-[0.9em] text-[0.82em] leading-snug text-[#5a594f]">
                  Two ideas from Lecture 4 are due for review before Problem Set 6.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-[0.4em]">
      <span className="size-[0.7em] rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}
