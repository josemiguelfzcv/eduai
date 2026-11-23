import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, HttpError, requireUser } from '../../../../lib/server/auth'
import { requireLearningLoop, type JoinedIdea, type SourceRow } from '../../../../lib/server/learning-data'
import { getMaterial, materialView } from '../../../../lib/server/material-map'

type Context = { params: Promise<{ id: string }> }

/**
 * The student's yes or no on one idea Lyceo wasn't sure of.
 *   A join (Lyceo said this idea is a skill the course already has): yes keeps it; no makes it its own skill.
 *   An inferred idea (no sentence of the material states it): yes keeps it; no removes it from the map.
 */
export async function POST(req: NextRequest, context: Context) {
  try {
    const { user, db } = await requireUser(req)
    requireLearningLoop(user)
    const id = Number((await context.params).id)
    if (!Number.isSafeInteger(id)) throw new HttpError(404, 'That material does not exist.')
    const material = await getMaterial(db, id, user.id)
    const body = await req.json()
    const keep = body.keep === true

    const { data: source, error } = await db
      .from('skill_sources')
      .select('id, skill_id, material_id, lesson_id, locator, quote, origin')
      .eq('id', Number(body.sourceId))
      .eq('material_id', id)
      .maybeSingle<SourceRow>()
    if (error) throw error
    if (!source) throw new HttpError(404, 'That idea is not in this material.')
    const { joined, ...rest } = source.locator
    const unjoined = { ...rest }

    if (joined) {
      if (keep) {
        const r = await db.from('skill_sources').update({ locator: unjoined }).eq('id', source.id)
        if (r.error) throw r.error
      } else {
        const idea = joined as JoinedIdea
        const created = await db
          .from('skills')
          .insert({
            academy_course_id: material.academy_course_id,
            name: idea.name,
            objective: idea.objective ?? null,
            facets: idea.facets?.length ? idea.facets : ['conceptual'],
          })
          .select('id')
          .single()
        if (created.error?.code === '23505')
          throw new HttpError(409, `Your course already has a skill named “${idea.name}”. Rename one of them first.`)
        if (created.error) throw created.error
        const r = await db
          .from('skill_sources')
          .update({ skill_id: created.data.id, locator: unjoined })
          .eq('id', source.id)
        if (r.error) throw r.error
      }
    } else if (source.origin === 'inferred') {
      if (keep) {
        const r = await db.from('skills').update({ confirmed_at: new Date().toISOString() }).eq('id', source.skill_id)
        if (r.error) throw r.error
      } else {
        const { count } = await db
          .from('skill_sources')
          .select('id', { count: 'exact', head: true })
          .eq('skill_id', source.skill_id)
        if ((count ?? 0) > 1) {
          const r = await db.from('skill_sources').delete().eq('id', source.id)
          if (r.error) throw r.error
        } else {
          // Removing the only source removes the skill. One with answers can't be deleted, so it's hidden instead.
          const r = await db.from('skills').delete().eq('id', source.skill_id).select('id')
          if (r.error) throw r.error
          if (!r.data?.length) await db.from('skills').update({ status: 'hidden' }).eq('id', source.skill_id)
        }
      }
    }
    return NextResponse.json(await materialView(db, id, user.id))
  } catch (err) {
    return errorResponse(err, 'Could not save that. Try again.')
  }
}
