'use client'

import { useMemo } from 'react'
import { assignCourseArt, BANNERS, THUMBS } from '../../lib/art'
import { useAcademy } from './academy'

/** The pictures of the student's courses, from the academy the shell knows. */
export function useCourseArt() {
  const courses = useAcademy()?.courses
  return useMemo(() => {
    const list = courses ?? []
    const art = assignCourseArt(list)
    const position = new Map(list.map((c, i) => [c.id, i]))
    return {
      thumb: (id: number) => THUMBS[art.get(id) ?? Math.abs(id) % THUMBS.length].src,
      banner: (id: number) => BANNERS[(position.get(id) ?? Math.abs(id)) % BANNERS.length],
    }
  }, [courses])
}
