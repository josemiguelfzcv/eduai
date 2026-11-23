// Learning styles a student can pick on their profile. The ids match values
// already stored in users.learning_style, so existing profiles keep working.

export type LearningStyle = {
  id: string
  label: string
  description: string
  /** How Theo should teach this student. Used in prompts. */
  teach: string
  /** A different angle to try when the first explanation didn't land. */
  fallback: string
}

export const LEARNING_STYLES: LearningStyle[] = [
  {
    id: 'analogias',
    label: 'Analogies and everyday examples',
    description: 'Start from something familiar, then get to the definition.',
    teach: 'Lead with an everyday analogy or a concrete example, then give the formal idea.',
    fallback: 'Walk through one small worked example step by step, with real numbers.',
  },
  {
    id: 'formal',
    label: 'Formal and structured',
    description: 'Definition first, then properties, then a worked example.',
    teach: 'Be precise and structured: state the definition, then the key property, then a short worked example.',
    fallback: 'Switch to an everyday analogy that captures the intuition before restating it precisely.',
  },
  {
    id: 'codigo',
    label: 'Through code',
    description: 'Explain ideas the way a programmer would think about them.',
    teach:
      'Connect ideas to programming when it helps: describe the logic like a small function or loop, and put tiny pseudo-code on the board.',
    fallback: 'Drop the code framing and use a concrete everyday example instead.',
  },
  {
    id: 'visual',
    label: 'Visual, with diagrams',
    description: 'Lean on the board: tables, arrows and pictures in words.',
    teach: 'Lean on the board: build tables, arrows, number lines or diagrams in words, and refer to them out loud.',
    fallback: 'Build the idea on the board as a small table or diagram and narrate it piece by piece.',
  },
]

export const getStyle = (id: string | null | undefined) => LEARNING_STYLES.find((s) => s.id === id) ?? null

export const MAJORS = [
  'Computer Science',
  'Mathematics',
  'Statistics',
  'Physics',
  'Chemistry',
  'Biology',
  'Economics',
  'Psychology',
  'History',
  'English',
  'Political Science',
  'Engineering',
  'Pre-med',
  'Undecided',
  'Other',
]

// Profiles saved before the English version stored Spanish names.
const LEGACY_MAJORS: Record<string, string> = {
  'Ciencias de la Computación': 'Computer Science',
  Matemáticas: 'Mathematics',
  Física: 'Physics',
  Química: 'Chemistry',
  Biología: 'Biology',
  Economía: 'Economics',
  Psicología: 'Psychology',
  Historia: 'History',
  Literatura: 'English',
  Ingeniería: 'Engineering',
  Medicina: 'Pre-med',
  Derecho: 'Political Science',
  Otra: 'Other',
}

export const normalizeMajor = (value: string | null | undefined) => (value ? (LEGACY_MAJORS[value] ?? value) : null)
