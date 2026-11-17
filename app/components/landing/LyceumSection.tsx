/** Section 5: The Lyceum. A preview of the future universal academy, clearly marked as coming soon. */

const DISCIPLINES = [
  { name: 'Computer Science', mentor: 'Ada Lovelace' },
  { name: 'Mathematics', mentor: 'Hypatia' },
  { name: 'Biology', mentor: 'Charles Darwin' },
  { name: 'Physics', mentor: 'Isaac Newton' },
  { name: 'Philosophy', mentor: 'Aristotle' },
]

// Computer Science pathway: x/y on a 760×230 canvas.
const NODES = {
  intro: { x: 70, y: 115, label: 'Intro to Programming' },
  ds: { x: 235, y: 115, label: 'Data Structures' },
  algo: { x: 400, y: 70, label: 'Algorithms' },
  db: { x: 400, y: 175, label: 'Databases' },
  ml: { x: 555, y: 70, label: 'Machine Learning' },
  dl: { x: 700, y: 70, label: 'Deep Learning' },
} as const

const EDGES: [keyof typeof NODES, keyof typeof NODES][] = [
  ['intro', 'ds'],
  ['ds', 'algo'],
  ['ds', 'db'],
  ['algo', 'ml'],
  ['ml', 'dl'],
]

export function LyceumSection() {
  return (
    <section id="lyceum" aria-labelledby="lyceum-title" className="relative overflow-hidden bg-forest-deep text-ivory">
      <Colonnade />
      <div className="relative mx-auto max-w-[80rem] px-5 py-24 sm:px-8 lg:py-32">
        <p className="eyebrow text-gold">The Lyceum</p>
        <h2 id="lyceum-title" className="mt-5 text-[clamp(2.3rem,4.4vw,3.8rem)]">
          The Lyceum <em className="font-normal text-gold">— Coming Soon</em>
        </h2>
        <p className="mt-5 max-w-[38rem] text-[1.05rem] text-ivory/80">
          A universal academy for learning beyond your syllabus: structured pathways across disciplines, each with a
          mentor inspired by a great thinker. It isn’t open yet. This is a preview of what we’re building.
        </p>

        <ul className="mt-14 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {DISCIPLINES.map((d) => (
            <li
              key={d.name}
              className="relative flex min-h-[13rem] flex-col justify-end rounded-t-[999px] border border-gold/35 bg-gradient-to-b from-forest/30 to-forest/70 px-4 pb-5 pt-16 text-center"
            >
              <span
                className="absolute left-1/2 top-5 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-gold"
                aria-hidden="true"
              />
              <h3 className="font-display text-[1.2rem] leading-snug">{d.name}</h3>
              <p className="mt-1 text-[0.8rem] text-ivory/65">Mentor inspired by {d.mentor}</p>
            </li>
          ))}
        </ul>

        <div className="mt-16 rounded-2xl border border-ivory/12 bg-forest/40 p-6 sm:p-8">
          <h3 className="font-display text-[1.35rem]">A pathway, not a pile of videos</h3>
          <p className="mt-2 max-w-[40rem] text-[0.95rem] text-ivory/70">
            Each discipline grows as a tree you climb in order. Here is the plan for Computer Science.
          </p>
          <Pathway />
        </div>
      </div>
    </section>
  )
}

function Pathway() {
  const order: (keyof typeof NODES)[] = ['intro', 'ds', 'algo', 'db', 'ml', 'dl']
  return (
    <>
      <svg
        viewBox="0 0 760 230"
        className="mt-6 hidden w-full md:block"
        role="img"
        aria-label="Computer Science pathway: Intro to Programming, then Data Structures, which branches into Algorithms and Databases. Algorithms leads to Machine Learning, then Deep Learning."
      >
        {EDGES.map(([a, b]) => {
          const p = NODES[a]
          const q = NODES[b]
          const mid = (p.x + q.x) / 2
          return (
            <path
              key={`${a}-${b}`}
              d={`M${p.x} ${p.y} C${mid} ${p.y}, ${mid} ${q.y}, ${q.x} ${q.y}`}
              fill="none"
              stroke="#c2a15a"
              strokeOpacity="0.7"
              strokeWidth="1.5"
            />
          )
        })}
        {order.map((key, i) => {
          const n = NODES[key]
          return (
            <g key={key}>
              <circle
                cx={n.x}
                cy={n.y}
                r={i === 0 ? 9 : 7}
                fill={i === 0 ? '#c2a15a' : '#152a20'}
                stroke="#c2a15a"
                strokeWidth="1.5"
              />
              <text
                x={n.x}
                y={n.y + (n.y > 150 ? 30 : -18)}
                textAnchor="middle"
                fill="#f6f1e7"
                fillOpacity="0.85"
                fontSize="13"
                fontFamily="Inter Variable, Inter, system-ui, sans-serif"
              >
                {n.label}
              </text>
            </g>
          )
        })}
      </svg>
      <ol className="mt-6 space-y-3 md:hidden">
        {[
          'Intro to Programming',
          'Data Structures',
          'Algorithms, or Databases',
          'Machine Learning',
          'Deep Learning',
        ].map((step, i) => (
          <li key={step} className="flex items-center gap-3 text-[0.95rem] text-ivory/85">
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full border border-gold ${i === 0 ? 'bg-gold' : ''}`}
              aria-hidden="true"
            />
            {step}
          </li>
        ))}
      </ol>
    </>
  )
}

/** Faint arches along the top of the section, drawn in gold hairlines. */
function Colonnade() {
  return (
    <svg
      className="pointer-events-none absolute inset-x-0 top-0 h-[22rem] w-full opacity-[0.13]"
      viewBox="0 0 1200 360"
      preserveAspectRatio="xMidYMin slice"
      aria-hidden="true"
    >
      {Array.from({ length: 9 }, (_, i) => {
        const x = 20 + i * 140
        return (
          <g key={i} fill="none" stroke="#c2a15a" strokeWidth="1.2">
            <path d={`M${x} 360 V150 A60 60 0 0 1 ${x + 120} 150 V360`} />
            <path d={`M${x - 12} 360 V140 A72 72 0 0 1 ${x + 132} 140 V360`} strokeOpacity="0.5" />
          </g>
        )
      })}
      <path d="M0 40 H1200 M0 52 H1200" stroke="#c2a15a" strokeWidth="1" fill="none" />
    </svg>
  )
}
