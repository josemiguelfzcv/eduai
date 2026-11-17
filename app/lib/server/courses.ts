import type { SupabaseClient } from '@supabase/supabase-js'
import { HttpError } from './auth'
import { normalizeLesson } from '../lesson'

export async function createCourse(db: SupabaseClient, userId: string, title: string, text: string) {
  const { data, error } = await db
    .from('courses')
    .insert({
      user_id: userId,
      title: title || 'Untitled lesson',
      description: text.slice(0, 500),
      status: 'extracted',
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
