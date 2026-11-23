import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, HttpError, requireUser } from '../../../../lib/server/auth'
import { proposeSkillMap } from '../../../../lib/server/learning'
import { materialPages, requireLearningLoop } from '../../../../lib/server/learning-data'
import { getMaterial, materialView, writeSkillMap } from '../../../../lib/server/material-map'
import { markMaterialMapped } from '../../../../lib/server/records'
import { verifyIdeas } from '../../../../lib/skill-map'

export const maxDuration = 120

type Context = { params: Promise<{ id: string }> }

/**
 * Finds the ideas in a material and writes its skill map, joined with the skills the course already has. Each quote
 * is checked against the page it cites; what can't be found there is marked inferred. Calling it again after the
 * map is written just returns it.
 */
export async function POST(req: NextRequest, context: Context) {
  try {
    requireLearningLoop()
    const { user, db } = await requireUser(req)
    const id = Number((await context.params).id)
    if (!Number.isSafeInteger(id)) throw new HttpError(404, 'That material does not exist.')
    const material = await getMaterial(db, id, user.id)
    if (material.status === 'mapped') return NextResponse.json(await materialView(db, id, user.id))
    if (material.status !== 'extracted') throw new HttpError(409, 'Lyceo hasn’t read this material yet.')
    if (material.academy_course_id === null) throw new HttpError(409, 'Put this material in a course first.')

    const [{ data: course }, { data: existing, error }] = await Promise.all([
      db.from('academy_courses').select('name').eq('id', material.academy_course_id).maybeSingle(),
      db
        .from('skills')
        .select('id, name, objective')
        .eq('academy_course_id', material.academy_course_id)
        .eq('status', 'active')
        .order('created_at'),
    ])
    if (error) throw error
    const pages = await materialPages(db, id)
    const proposed = await proposeSkillMap({
      title: material.title,
      courseName: course?.name ?? 'Course',
      pages,
      existing: existing ?? [],
      graded: material.policy === 'graded',
      userId: user.id,
    })
    const ideas = verifyIdeas(proposed, pages, existing ?? [])
    if (!ideas.length) throw new HttpError(422, 'Lyceo couldn’t find ideas to practice in this material.')
    await writeSkillMap(db, material, ideas)
    await markMaterialMapped(user.id, id)
    return NextResponse.json(await materialView(db, id, user.id))
  } catch (err) {
    return errorResponse(err, 'Could not map this material. Try again.')
  }
}
