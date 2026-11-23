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

// ---------- the learning environment ----------

export type MaterialRole = 'lecture' | 'assignment' | 'reading' | 'other'

/** A material in the course sidebar. Lectures carry their lesson's progress. */
export type LectureSummary = {
  id: number
  title: string
  role: MaterialRole
  sequence: number | null
  lectureDate: string | null
  status: string
  /** Sections in the lesson's outline (0 before the lesson is planned). */
  sections: number
  completed: number
  openedAt: string | null
}

export type LessonMessage = {
  id: number
  role: 'student' | 'lyceo'
  content: string
  context: { sectionId?: string; quote?: string } | null
  createdAt: string
}

export type LectureView = {
  lecture: {
    id: number
    title: string
    role: MaterialRole
    status: string
    policy: 'study' | 'graded'
    failure: string | null
    pageCount: number
    courseId: number | null
    courseName: string | null
    lectureDate: string | null
  }
  /** Its place among the course's lectures (1-based), when it is one. */
  number: number | null
  total: number
  prevId: number | null
  nextId: number | null
  lesson: {
    id: number
    outline: import('./written-lesson').OutlineSection[]
    /** The text of each section written so far. */
    sections: Record<string, string>
    currentSection: string | null
    completed: string[]
    position: import('./written-lesson').ReadingAnchor | null
  } | null
  messages: LessonMessage[]
  /** The lecture's skills with their state: what the lesson and Ask Lyceo remember about the student. */
  skills: { id: number; name: string; state: import('./mastery').SkillStateName; label: string; reason: string }[]
}
