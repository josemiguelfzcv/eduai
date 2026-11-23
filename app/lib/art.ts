// The pictures of the academy: a scene for each course (chosen by its subject when its name says it, and different
// from the student's other courses when possible), the banners across the top of course and Lyceo pages, and the
// landing's scenes. Plain data, usable on the server and in the browser.

const BASE = '/images/lyceo'

export const THUMBS: { src: string; subject: RegExp }[] = [
  {
    src: `${BASE}/course_thumbnails/01_probability_math_341.webp`,
    subject: /\b(prob\w*|stat\w*|math\w*|calc\w*|algebra|geometr\w*|physic\w*|number)/i,
  },
  {
    src: `${BASE}/course_thumbnails/02_responsible_ai_csci_382.webp`,
    subject: /\b(ai|artificial|machine|learning|ethic\w*|responsible|robot\w*|intelligen\w*|neural|data)\b/i,
  },
  {
    src: `${BASE}/course_thumbnails/03_financial_economics_econ_232.webp`,
    subject: /\b(econ\w*|financ\w*|account\w*|business|market\w*|money|invest\w*|trading)/i,
  },
  {
    src: `${BASE}/course_thumbnails/04_nlp_csci_381.webp`,
    subject: /\b(nlp|language\w*|linguist\w*|literat\w*|writing|english|spanish|french|text|reading|cs\w*|comput\w*)/i,
  },
  {
    src: `${BASE}/course_thumbnails/05_history_hist_245.webp`,
    subject: /\b(hist\w*|classic\w*|philosoph\w*|art|archae\w*|greek|roman|europe\w*|religio\w*|politic\w*)/i,
  },
]

export type Banner = { src: string; position: string }

/** Banners for page headers, each with the part of the picture to keep in a wide, short strip. */
export const BANNERS: readonly Banner[] = [
  { src: `${BASE}/banners/01_colonnade_sunlit.webp`, position: '72% 42%' },
  { src: `${BASE}/banners/02_philosopher_library.webp`, position: '62% 38%' },
  { src: `${BASE}/banners/03_courtyard_marble.webp`, position: '30% 40%' },
]

export const LANDING = {
  hero: `${BASE}/landing/01_hero_for_minds_in_motion.webp`,
  academy: `${BASE}/landing/02_my_academy_marble_bust_books.webp`,
  learning: `${BASE}/landing/03_learning_experience_background.webp`,
  lyceum: `${BASE}/landing/04_lyceum_landscape.webp`,
} as const

export const TOPBAR_SCENE = `${BASE}/derived/topbar-valley.webp`
/** Where the hero's picture moves: red for leaves in the breeze, green for the drifting sky. */
export const HERO_MOTION = `${BASE}/derived/hero-motion.webp`

type CourseLike = { id: number; name: string; code: string | null }

/** Assigns each course its picture: by subject first, then the pictures no other course has. */
export function assignCourseArt(courses: CourseLike[]) {
  const art = new Map<number, number>()
  const used = new Set<number>()
  const ordered = [...courses].sort((a, b) => a.id - b.id)
  for (const course of ordered) {
    const words = `${course.code ?? ''} ${course.name}`
    const match = THUMBS.findIndex((t, i) => !used.has(i) && t.subject.test(words))
    if (match >= 0) {
      art.set(course.id, match)
      used.add(match)
    }
  }
  for (const course of ordered) {
    if (art.has(course.id)) continue
    const free = THUMBS.findIndex((_, i) => !used.has(i))
    const pick = free >= 0 ? free : Math.abs(course.id) % THUMBS.length
    art.set(course.id, pick)
    used.add(pick)
  }
  return art
}
