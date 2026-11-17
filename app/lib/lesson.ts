// Shared lesson types. Lessons are stored as JSON in courses.script.
// Version 2 is the English format; older StudyAI lessons (Spanish keys) are converted on read.

export type Pace = 'gentle' | 'steady' | 'brisk'

export type Segment = {
  concept: string
  narration: string
  board: string[]
  check: { question: string; idealAnswer: string }
}

export type Personalization = {
  styleId: string | null
  major: string | null
  pace: Pace
  focusConcepts: string[]
}

export type LessonMeta = {
  version: 2
  kind: 'lesson' | 'review'
  personalization?: Personalization
  sourceCourseId?: number
}

export type Lesson = {
  title: string
  estimatedMinutes: number
  segments: Segment[]
  meta?: LessonMeta
}

type LegacySegment = {
  concepto?: string
  narracion?: string
  pizarra?: string
  pregunta_check?: string
}

const looksLikeLatex = (s: string) => /[\\^_]/.test(s)

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function normalizeLesson(raw: unknown): Lesson | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  if (Array.isArray(r.segments)) {
    const segments = (r.segments as Partial<Segment>[])
      .map((s) => ({
        concept: str(s.concept),
        narration: str(s.narration),
        board: Array.isArray(s.board) ? s.board.filter((l): l is string => typeof l === 'string') : [],
        check: { question: str(s.check?.question), idealAnswer: str(s.check?.idealAnswer) },
      }))
      .filter((s) => s.narration)
    if (!segments.length) return null
    return {
      title: str(r.title) || 'Untitled lesson',
      estimatedMinutes: Number(r.estimatedMinutes) || Math.max(3, segments.length * 2),
      segments,
      meta: r.meta as LessonMeta | undefined,
    }
  }

  if (Array.isArray(r.segmentos)) {
    const segments = (r.segmentos as LegacySegment[])
      .map((s) => {
        const pizarra = str(s.pizarra)
        const board = !pizarra
          ? []
          : looksLikeLatex(pizarra)
            ? [`$$${pizarra}$$`]
            : pizarra.split(/\n+/).filter(Boolean)
        return {
          concept: str(s.concepto),
          narration: str(s.narracion),
          board,
          check: { question: str(s.pregunta_check), idealAnswer: '' },
        }
      })
      .filter((s) => s.narration)
    if (!segments.length) return null
    const minutes = parseInt(str(r.duracion_estimada), 10)
    return {
      title: str(r.titulo) || 'Untitled lesson',
      estimatedMinutes: Number.isFinite(minutes) ? minutes : segments.length * 2,
      segments,
    }
  }

  return null
}

/** What the dashboard shows about a student's learner model (see /api/learner). */
export type LearnerSummary = {
  answers: number
  conceptsSeen: number
  firstTryAccuracy: number | null
  recentFirstTryAccuracy: number | null
  avgSecondsToAnswer: number | null
  pace: Pace
  styleId: string | null
  major: string | null
  mastered: number
  needsReview: { concept: string; courseId: number; courseTitle: string }[]
}
