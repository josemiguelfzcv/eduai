import type { SupabaseClient } from '@supabase/supabase-js'
import { HttpError } from './auth'
import { normalizeLesson } from '../lesson'

/** Creates the lesson row. `academyCourseId` files it under one of the student's courses (already verified). */
export async function createCourse(
  db: SupabaseClient,
  userId: string,
  title: string,
  text: string,
  academyCourseId: number | null = null,
) {
  const { data, error } = await db
    .from('courses')
    .insert({
      user_id: userId,
      title: title || 'Untitled lesson',
      description: text.slice(0, 500),
      status: 'extracted',
      // Only send the column when it's used, so lessons can still be created before the My Academy migration.
      ...(academyCourseId ? { academy_course_id: academyCourseId } : {}),
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id as number
}

export async function getOwnCourse(db: SupabaseClient, userId: string, courseId: unknown) {
  const id = Number(courseId)
  if (!Number.isInteger(id)) throw new HttpError(400, 'Missing lesson id.')
  const { data, error } = await db
    .from('courses')
    .select('id, title, script')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new HttpError(404, 'That lesson does not exist or is not yours.')
  return { id, title: data.title as string, lesson: normalizeLesson(data.script) }
}
