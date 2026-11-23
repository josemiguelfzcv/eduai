import { renderDisplayMath, renderInline } from '../../lib/lesson-render'
import {
  BookIcon,
  ChatIcon,
  CheckCircleIcon,
  HomeIcon,
  PersonIcon,
  PlayCircleIcon,
  PlayIcon,
  SparkleIcon,
} from '../learn/icons'
import { LaurelMark } from '../learn/LaurelMark'

// The lecture workspace drawn with the app's own styles: the course sidebar, the lesson with a definition box, and
// Ask Lyceo answering a question about a passage. When it scrolls into view the passage is highlighted, asked
// about, and answered. Formulas are typeset on the server; nothing here needs the browser.

const html = (s: string) => ({ __html: renderInline(s) })
const display = (tex: string) => ({ __html: renderDisplayMath(tex) })

export function LearningPreview() {
  return (
    <div className="text-[clamp(7.5px,0.58vw,10px)]" aria-hidden="true">
      <div className="rounded-[2.6em] bg-[#1c1e1b] p-[1.3em] shadow-[0_5em_8em_-3em_rgba(40,28,10,0.6)]">
        <div className="grid h-[39.5em] grid-cols-[12.5em_1fr_19em] overflow-hidden rounded-[1.3em] bg-[#f6eee2]">
          {/* The course sidebar */}
          <div className="bg-[#173a20] px-[1.1em] py-[1.4em] text-[#f6f1e7]">
            <span className="flex items-center gap-[0.45em]">
              <LaurelMark size={20} className="text-[#f6f1e7]" />
              <span className="font-display text-[1.5em] font-semibold">Lyceo</span>
            </span>
            <p className="mt-[1.4em] font-display text-[1.05em] font-semibold">MATH 341</p>
            <p className="text-[0.78em] opacity-75">Probability</p>
            <ul className="mt-[1em] space-y-[0.25em] text-[0.92em]">
              <li className="flex items-center gap-[0.5em] px-[0.5em] py-[0.35em] opacity-85">
                <HomeIcon size={13} /> Overview
              </li>
              <li className="flex items-center gap-[0.5em] rounded-[0.5em] bg-white/15 px-[0.5em] py-[0.35em]">
                <BookIcon size={13} /> Lectures
              </li>
            </ul>
            <ol className="mt-[0.5em] space-y-[0.3em] pl-[0.6em] text-[0.8em]">
              {['Random Variables', 'Distributions'].map((t, i) => (
                <li key={t} className="flex items-center gap-[0.5em] opacity-85">
                  <CheckCircleIcon size={12} /> {i + 4} {t}
                </li>
              ))}
              <li className="flex items-center gap-[0.5em] rounded-[0.5em] bg-[#efe9d8] px-[0.4em] py-[0.3em] font-semibold text-[#173a20]">
                <PlayCircleIcon size={12} /> 6 Moment Generating…
              </li>
            </ol>
          </div>

          {/* The lesson */}
          <div className="overflow-hidden px-[1.8em] py-[1.5em]">
            <p className="text-[0.85em] text-[#5a594f]">Lecture 6 of 12</p>
            <p className="font-display text-[2em] font-bold leading-tight text-[#1d1c19]">
              Moment Generating Functions
            </p>
            <div className="mt-[0.7em] h-[0.45em] rounded-full bg-[#ebdfcf]">
              <div className="h-full w-[38%] rounded-full bg-[#3d5a37]" />
            </div>
            <div className="mt-[1.1em] rounded-[1.2em] border border-[#eee3d2] bg-[#fffaf3] px-[1.4em] py-[1.2em]">
              <p className="flex items-center gap-[0.45em] text-[0.9em] font-semibold text-[#1d1c19]">
                <LaurelMark size={16} className="text-[#173a20]" /> Lyceo
              </p>
              <p
                className="lesson-text mt-[0.5em] font-display text-[1.08em] leading-[1.55] text-[#24231f]"
                dangerouslySetInnerHTML={html(
                  'Today we study **moment generating functions**: one function that holds a whole distribution.',
                )}
              />
              <p className="lesson-text relative mt-[0.5em] font-display text-[1.08em] leading-[1.55] text-[#24231f]">
                <span className="rounded-[0.2em] transition-colors delay-300 duration-700 group-data-[seen=true]/seen:bg-[#f2dfa8]">
                  Its moments become derivatives at zero.
                </span>
                <span className="ml-[0.8em] inline-block translate-y-[0.2em] whitespace-nowrap rounded-full bg-[#173a20] px-[0.9em] py-[0.3em] align-middle font-sans text-[0.72em] text-[#fbf5ea] opacity-0 shadow-lg transition-[opacity,transform] delay-700 duration-500 group-data-[seen=true]/seen:translate-y-0 group-data-[seen=true]/seen:opacity-100">
                  Ask about this
                </span>
              </p>
              <div className="mt-[1em] overflow-hidden rounded-[1em] border border-[#e9dfcd]">
                <p className="flex items-center gap-[0.6em] bg-[#f3ecdd] px-[1em] py-[0.55em] text-[0.78em] font-semibold uppercase tracking-[0.1em] text-[#3b3426]">
                  <BookIcon size={12} /> What is a moment generating function?
                </p>
                <div className="bg-[#fcf5ea] px-[1.2em] py-[0.9em]">
                  <p
                    className="lesson-text font-display text-[1em] text-[#24231f]"
                    dangerouslySetInnerHTML={html('The **MGF** of a random variable $X$ is')}
                  />
                  <div className="mt-[0.5em] flex justify-center">
                    <div
                      className="lesson-math rounded-[0.8em] border border-[#ecdfca] bg-[#f8efe1] px-[1em] py-[0.2em]"
                      dangerouslySetInnerHTML={display('M_X(t) = E[e^{tX}]')}
                    />
                  </div>
                  <p
                    className="lesson-text mt-[0.5em] font-display text-[1em] text-[#24231f]"
                    dangerouslySetInnerHTML={html(
                      "Where it exists near $t = 0$, each derivative at $0$ is a moment: $E[X] = M_X'(0)$.",
                    )}
                  />
                </div>
              </div>
              <div className="mt-[1.1em] flex gap-[0.7em]">
                <span className="flex items-center gap-[0.5em] rounded-full bg-[#173a20] px-[1.2em] py-[0.6em] text-[0.85em] font-semibold text-[#fbf5ea]">
                  <PlayIcon size={11} /> Continue: The exponential
                </span>
                <span className="flex items-center gap-[0.5em] rounded-full border border-[#dcc9a3] px-[1.2em] py-[0.6em] text-[0.85em] font-semibold text-[#173a20]">
                  <span className="text-[#b9893a]">
                    <SparkleIcon size={11} />
                  </span>
                  Practice this section
                </span>
              </div>
            </div>
          </div>

          {/* Ask Lyceo */}
          <div className="flex flex-col border-l border-[#eadfcd] bg-[#fbf4eb] px-[1.2em] py-[1.4em]">
            <p className="flex items-center gap-[0.5em] font-display text-[1.6em] font-bold text-[#1d1c19]">
              <ChatIcon size={16} /> Ask Lyceo
            </p>
            <p className="text-[0.78em] text-[#5a594f]">Questions about the lesson, without leaving it.</p>
            <div className="mt-[1.2em] space-y-[0.9em]">
              <div className="flex translate-y-[0.6em] items-start gap-[0.5em] opacity-0 transition delay-[1100ms] duration-500 group-data-[seen=true]/seen:translate-y-0 group-data-[seen=true]/seen:opacity-100">
                <span className="grid size-[2em] shrink-0 place-items-center rounded-full bg-[#ebe6d5] text-[#3e3d36]">
                  <PersonIcon size={12} />
                </span>
                <div className="rounded-[1em] bg-[#e3e2cc] px-[0.9em] py-[0.6em] text-[0.86em] leading-snug text-[#1d1c19]">
                  <p className="mb-[0.3em] border-l-2 border-[#173a20]/30 pl-[0.5em] text-[0.92em] italic text-[#4b4a42]">
                    “Its moments become derivatives at zero.”
                  </p>
                  Why does the derivative at 0 give the mean?
                </div>
              </div>
              <div className="flex translate-y-[0.6em] items-start gap-[0.5em] opacity-0 transition delay-[1900ms] duration-500 group-data-[seen=true]/seen:translate-y-0 group-data-[seen=true]/seen:opacity-100">
                <LaurelMark size={20} className="mt-[0.3em] shrink-0 text-[#173a20]" />
                <div className="rounded-[1em] border border-[#eee4d4] bg-[#fffbf6] px-[0.9em] py-[0.7em]">
                  <p className="text-[0.82em] font-semibold text-[#1d1c19]">Lyceo</p>
                  <p
                    className="lesson-text mt-[0.2em] font-display text-[0.92em] leading-[1.45] text-[#24231f]"
                    dangerouslySetInnerHTML={html(
                      "Differentiate inside the expectation: $M_X'(t) = E[Xe^{tX}]$. At $t = 0$ the exponential is $1$, so",
                    )}
                  />
                  <div className="mt-[0.4em] flex justify-center">
                    <div
                      className="lesson-math rounded-[0.7em] border border-[#ecdfca] bg-[#f8efe1] px-[0.8em] text-[0.9em]"
                      dangerouslySetInnerHTML={display("M_X'(0) = E[X]")}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-auto rounded-[1em] border border-[#e6dac6] bg-[#fffaf3] px-[0.9em] py-[0.7em] text-[0.82em] text-[#7a776c]">
              Ask a follow-up question…
            </div>
          </div>
        </div>
      </div>
      {/* The laptop's base */}
      <div className="mx-auto h-[1.4em] w-[108%] -translate-x-[3.7%] rounded-b-[1.6em] bg-gradient-to-b from-[#d9d3c8] to-[#b9b2a6] shadow-[0_2em_3em_-1.4em_rgba(40,28,10,0.55)]" />
    </div>
  )
}
