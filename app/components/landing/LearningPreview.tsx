import type { CSSProperties } from 'react'
import { renderDisplayMath, renderInline } from '../../lib/lesson-render'
import {
  ArrowLeftIcon,
  BookIcon,
  CalendarIcon,
  ChartIcon,
  ChatIcon,
  ChevronRightIcon,
  ClipboardIcon,
  HomeIcon,
  LayersIcon,
  NetworkIcon,
  PanelRightIcon,
  PlusIcon,
  RepeatIcon,
  SearchIcon,
  SendIcon,
  SparkleIcon,
  TargetIcon,
} from '../learn/icons'
import { LaurelMark } from '../learn/LaurelMark'

// A lecture as the laptop in section 3 shows it: an 879 × 564 screen, laid out on the design's own screen. Drawn with
// the app's pieces: the one sidebar (the three places, then the course open at its lectures), the breadcrumbs, a
// practice question as Quick Check asks it, the lesson's explanation with its formula typeset, and Ask Lyceo.
// Formulas are typeset on the server; nothing here needs the browser.

export const LEARNING_SCREEN = { width: 879, height: 564 }

const THUMBS = '/images/lyceo/course_thumbnails'
const at = (left: number, top: number, width?: number, height?: number): CSSProperties => ({
  position: 'absolute',
  left,
  top,
  width,
  height,
})
const icon = (size: number): CSSProperties => ({ width: size, height: size })
const html = (s: string) => ({ __html: renderInline(s) })

const OPTIONS = ['Breadth-First Search', 'Greedy Best-First Search', 'A* Search', 'Depth-First Search']

export function LearningScreen() {
  return (
    <div className="relative overflow-hidden bg-[#fbf3ea] font-sans text-[#1f241c]" style={LEARNING_SCREEN}>
      {/* The sidebar */}
      <div className="absolute inset-y-0 left-0 w-[185px] bg-[#12301a] text-[#f1e9d8]">
        <span className="flex items-center gap-[8px]" style={at(23, 18)}>
          <LaurelMark size={0} className="text-[#efe5d1]" style={icon(28)} />
          <span className="font-display text-[25px] font-medium leading-none [font-variation-settings:'opsz'_36]">
            Lyceo
          </span>
        </span>
        {[
          { label: 'My Academy', Icon: HomeIcon, y: 72 },
          { label: 'Study Plan', Icon: CalendarIcon, y: 104 },
          { label: 'Global Progress', Icon: ChartIcon, y: 136 },
        ].map(({ label, Icon, y }) => (
          <span
            key={label}
            className="flex items-center gap-[11px] text-[13.5px] leading-none text-[#f1e9d8]/85"
            style={at(30, y, 150, 17)}
          >
            <Icon size={0} style={icon(17)} />
            {label}
          </span>
        ))}
        <span className="h-px bg-[#f1e9d8]/15" style={at(13, 168, 158, 1)} />
        <span className="text-[11px] font-medium leading-none text-[#f1e9d8]/65" style={at(22, 183)}>
          Your Courses
        </span>
        <span
          className="flex items-center gap-[9px] rounded-[9px] bg-[#f1e9d8]/[0.12] ring-1 ring-[#f1e9d8]/[0.12]"
          style={at(13, 199, 158, 34)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${THUMBS}/02_responsible_ai_csci_382.webp`}
            alt=""
            className="ml-[4px] size-[26px] rounded-[6px] object-cover"
          />
          <span className="font-display text-[14.5px] font-semibold leading-none">CSCI 270</span>
        </span>
        <span className="rounded-[8px] bg-[#f1e9d8]/[0.16]" style={at(21, 269, 150, 28)} />
        {[
          { label: 'Overview', Icon: HomeIcon },
          { label: 'Lectures', Icon: BookIcon },
          { label: 'Assignments', Icon: ClipboardIcon },
          { label: 'Materials', Icon: LayersIcon },
          { label: 'Knowledge Map', Icon: NetworkIcon },
        ].map(({ label, Icon }, i) => (
          <span
            key={label}
            className={`flex items-center gap-[10px] text-[13px] leading-none ${i === 1 ? 'font-medium' : 'text-[#f1e9d8]/80'}`}
            style={at(31, 244 + i * 31, 140, 16)}
          >
            <Icon size={0} style={icon(15)} />
            {label}
          </span>
        ))}
        {[
          { code: 'MATH 341', art: `${THUMBS}/01_probability_math_341.webp` },
          { code: 'ECON 232', art: `${THUMBS}/03_financial_economics_econ_232.webp` },
        ].map((c, i) => (
          <span key={c.code} className="flex items-center gap-[9px]" style={at(17, 409 + i * 38, 150, 26)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.art} alt="" className="size-[26px] rounded-[6px] object-cover opacity-90" />
            <span className="font-display text-[14.5px] font-semibold leading-none text-[#f1e9d8]/90">{c.code}</span>
          </span>
        ))}
        <span className="h-px bg-[#f1e9d8]/15" style={at(13, 488, 158, 1)} />
        <span className="flex items-center gap-[11px] text-[13.5px] leading-none text-[#f1e9d8]/85" style={at(30, 503)}>
          <PlusIcon size={0} style={icon(17)} />
          Add a course
        </span>
      </div>

      {/* The lecture */}
      <span className="flex items-center gap-[7px] text-[12.5px] leading-none text-[#6b665c]" style={at(211, 21)}>
        <ArrowLeftIcon size={0} style={icon(13)} />
        My Academy
        <ChevronRightIcon size={0} style={icon(11)} />
        CSCI 270
        <ChevronRightIcon size={0} style={icon(11)} />
        <span className="font-semibold text-[#1f241c]">Lecture 6</span>
      </span>
      <SearchIcon size={0} strokeWidth={1.9} style={{ ...at(792, 23), ...icon(17) }} />
      <PanelRightIcon size={0} strokeWidth={1.8} style={{ ...at(831, 23), ...icon(17) }} />
      <p
        className="m-0 font-display text-[24px] font-bold leading-none text-[#1d211a] [font-variation-settings:'opsz'_24]"
        style={at(211, 49)}
      >
        A* Search
      </p>
      <p className="m-0 font-display text-[14px] leading-none text-[#2d2b26]" style={at(212, 80)}>
        An informed search algorithm that uses a heuristic to efficiently find the lowest-cost path.
      </p>

      <div
        className="flex items-center rounded-[12px] border border-[#ece1d1] bg-[#fdf7f0] p-[3px] text-[13.5px] font-medium leading-none"
        style={at(207, 110, 653, 37)}
      >
        {[
          { label: 'Learn', Icon: BookIcon },
          { label: 'Practice', Icon: TargetIcon },
          { label: 'Review', Icon: RepeatIcon },
        ].map(({ label, Icon }, i) => (
          <span
            key={label}
            className={`flex h-full flex-1 items-center justify-center gap-[9px] rounded-[9px] ${i === 1 ? 'bg-[#d8e0c6] text-[#1d2f1a]' : ''}`}
          >
            <Icon size={0} style={icon(17)} />
            {label}
          </span>
        ))}
      </div>

      {/* Practice, as Quick Check asks it */}
      <div
        className="rounded-[14px] border border-[#ece1d1] bg-[#faf2e9] shadow-[0_10px_24px_-18px_rgba(70,45,15,0.55)]"
        style={at(207, 163, 314, 329)}
      >
        <span
          className="grid place-items-center rounded-full bg-[#e2e9cf] text-[12.5px] font-medium text-[#2e4a24]"
          style={at(22, 13, 68, 22)}
        >
          Practice
        </span>
        <span className="text-[12px] font-medium leading-none text-[#3b3a35]" style={at(256, 18)}>
          Q3 of 5
        </span>
        <p
          className="m-0 whitespace-nowrap font-display text-[15px] font-bold leading-[19px] text-[#1d211a] [font-variation-settings:'opsz'_16]"
          style={at(28, 46)}
        >
          Which search algorithm is
          <br />
          guaranteed to find the optimal
          <br />
          solution when a heuristic is admissible?
        </p>
        {OPTIONS.map((option, i) => {
          const chosen = i === 2
          return (
            <span
              key={option}
              className={`flex items-center rounded-[8px] text-[13px] font-medium leading-none ${
                chosen ? 'border-[1.5px] border-[#3f5d31] bg-[#e8ebd2]' : 'border border-[#ebe1d4] bg-[#fbf5ef]'
              }`}
              style={at(chosen ? 15 : 18, 113 + i * 38.3, chosen ? 284 : 272, chosen ? 31 : 29)}
            >
              <span
                className={`ml-[13px] mr-[14px] grid size-[22px] place-items-center rounded-full text-[12px] font-semibold ${
                  chosen ? 'bg-[#1f3d22] text-[#f6efe1]' : 'text-[#2a2924]'
                }`}
              >
                {'ABCD'[i]}
              </span>
              {option}
            </span>
          )
        })}
        <span
          className="grid place-items-center rounded-[8px] bg-[#17371b] text-[13px] font-medium text-[#f6efe1]"
          style={at(22, 291, 119, 31)}
        >
          Check answer
        </span>
        <span
          className="text-[12.5px] leading-none text-[#2e4a24] underline underline-offset-[3px]"
          style={at(160, 300)}
        >
          Show a hint
        </span>
      </div>

      {/* The lesson's explanation */}
      <div
        className="rounded-[14px] border border-[#ece1d1] bg-[#faf2e9] shadow-[0_10px_24px_-18px_rgba(70,45,15,0.55)]"
        style={at(535, 163, 326, 329)}
      >
        <span className="flex items-center gap-[10px]" style={at(22, 15)}>
          <SparkleIcon size={0} className="text-[#c08a2a]" strokeWidth={2} style={icon(16)} />
          <span className="font-display text-[16.5px] font-bold leading-none text-[#1d211a] [font-variation-settings:'opsz'_16]">
            Understanding the Concept
          </span>
        </span>
        <p
          className="lesson-text m-0 font-display text-[13.5px] leading-[17.6px] text-[#24231f]"
          style={at(28, 44, 285)}
          dangerouslySetInnerHTML={html(
            'A* Search is optimal when the heuristic is admissible, meaning it never overestimates the true cost to the goal. It scores each node by the path cost so far, $g(n)$, plus a heuristic estimate, $h(n)$:',
          )}
        />
        <div
          className="lesson-math grid place-items-center rounded-[10px] border border-[#ecdfca] bg-[#f6eddf] text-[15px]"
          style={at(28, 152, 270, 52)}
          dangerouslySetInnerHTML={{ __html: renderDisplayMath('f(n) = g(n) + h(n)') }}
        />
        <p
          className="lesson-text m-0 font-display text-[13.5px] leading-[17.6px] text-[#24231f]"
          style={at(28, 216, 285)}
          dangerouslySetInnerHTML={html('It always expands the node with the lowest $f(n)$ next.')}
        />
        <div
          className="flex gap-[9px] rounded-[10px] bg-[#eef0de] text-[11px] leading-[15px]"
          style={at(11, 266, 304, 49)}
        >
          <BookIcon size={0} className="ml-[10px] mt-[9px] shrink-0" style={icon(15)} />
          <p className="m-0 mt-[9px] pr-[10px] text-[#2a2924]">
            <span className="font-semibold">Key takeaway</span>&nbsp; A* is both complete and optimal when the heuristic
            is admissible.
          </p>
        </div>
      </div>

      {/* Ask Lyceo */}
      <div
        className="flex items-center rounded-[12px] border border-[#ebe0d0] bg-[#fcf6ef] shadow-[0_8px_20px_-16px_rgba(70,45,15,0.5)]"
        style={at(207, 510, 654, 37)}
      >
        <ChatIcon size={0} className="ml-[14px] text-[#3b3a35]" style={icon(16)} />
        <span className="ml-[12px] text-[12.5px] leading-none text-[#6b665c]">
          Ask Lyceo a question about this lesson…
        </span>
        <span className="ml-auto mr-[8px] grid size-[26px] place-items-center rounded-full bg-[#ebe4d8] text-[#3b3a35]">
          <SendIcon size={0} style={icon(13)} />
        </span>
      </div>
    </div>
  )
}
