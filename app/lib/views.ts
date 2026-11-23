// The shapes the learning loop's routes return, shared with the pages that show them. Types only.

import type { SessionItem, SessionSummary } from './study'

export type JoinedIdea = {
  name: string
  objective?: string | null
  facets?: ('conceptual' | 'procedural' | 'application')[]
}

export type IdeaView = {
  sourceId: number
  skillId: number
  name: string
  objective: string | null
  pages: number[]
  quote: string | null
  origin: 'extracted' | 'inferred' | 'student'
  /** The skill was already in the course before this material. */
  already: boolean
  /** Lyceo joined an idea it found here, named like this, with the existing skill. */
  joined: JoinedIdea | null
  /** Needs a yes or no: an inferred idea not confirmed yet, or a join Lyceo made. */
  flagged: boolean
}

export type MaterialView = {
  material: {
    id: number
    title: string
    kind: string
    status: string
    policy: 'study' | 'graded'
    failure: string | null
    courseId: number | null
    courseName: string | null
    pageCount: number
    createdAt: string
  }
  headline: string | null
  ideas: IdeaView[]
}

export type AnswerView = { verdict: string; answer: string; solution: string | null; final: boolean; mode: string }

export type SessionView = {
  session: {
    id: number
    status: 'active' | 'completed' | 'stopped'
    mode: string
    courseId: number | null
    courseName: string | null
    activeSeconds: number
    startedAt: string
  }
  steps: { item: SessionItem; answers: AnswerView[] }[]
  current: string | null
  pendingTeach: string | null
  questions: number
  answered: number
  remaining: number
  /** Hints already shown for the current question. */
  hints: string[]
  hintsLeft: number
  skillNames: Record<number, string>
  materialTitles: Record<number, string>
  summary: SessionSummary | null
}
