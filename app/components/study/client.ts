'use client'

import { useEffect, useState } from 'react'
import { clockBody } from '../../lib/clock'
import { getJSON, postJSON } from '../../lib/supabase'

/** Starts a Quick Check and returns its id. Writing the questions takes 15 to 40 seconds. */
export async function startQuickCheck(opts: { courseId: number; skillIds?: number[]; materialId?: number }) {
  const { sessionId } = await postJSON<{ sessionId: number }>('/api/sessions', { ...opts, ...clockBody() })
  return sessionId
}

type Features = { learningLoop: boolean }
let features: Promise<Features> | null = null

/** Which parts of Lyceo this deployment runs. Null until known. */
export function useFeatures() {
  const [value, setValue] = useState<Features | null>(null)
  useEffect(() => {
    let active = true
    if (!features)
      features = getJSON<Features>('/api/features').catch(() => {
        features = null
        return { learningLoop: false }
      })
    features.then((f) => active && setValue(f))
    return () => {
      active = false
    }
  }, [])
  return value
}
